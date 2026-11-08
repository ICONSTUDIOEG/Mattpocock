#!/usr/bin/env node
// Minimal MCP server over stdio (newline-delimited JSON-RPC 2.0).
// Gives Claude its own phone number: send and read texts, place calls,
// and read back call status and recordings.

import { createInterface } from "node:readline";
import { loadConfig, createClient } from "./twilio.mjs";
import { loadVoiceConfig, createVoiceClient } from "./elevenlabs.mjs";

const cfg = loadConfig();
const client = cfg.missing.length ? null : createClient(cfg);
const voiceCfg = loadVoiceConfig();
const voice = voiceCfg.missing.length ? null : createVoiceClient(voiceCfg, cfg);

const num = { type: "string", description: "E.164 phone number, e.g. +201001234567" };

export const TOOLS = [
  {
    name: "phone_whoami",
    description: "Show Claude's own phone number and whether the phone is configured.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "send_sms",
    description: "Send a text message from Claude's number. Outbound: costs money and reaches a real person.",
    inputSchema: {
      type: "object",
      properties: { to: num, body: { type: "string", description: "Message text" } },
      required: ["to", "body"],
    },
    annotations: { destructiveHint: true, openWorldHint: true },
  },
  {
    name: "list_messages",
    description: "Read texts sent to (inbound), from (outbound), or both (all) Claude's number, newest first.",
    inputSchema: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["inbound", "outbound", "all"], default: "inbound" },
        with: { ...num, description: "Only messages exchanged with this number" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "place_call",
    description:
      "Call a number from Claude's number and speak a message with text-to-speech. " +
      "Set listen_seconds to keep the line open afterwards and record=true to capture what the person says; " +
      "read it back later with get_call. This is a one-way announcement, not a live two-way conversation.",
    inputSchema: {
      type: "object",
      properties: {
        to: num,
        message: { type: "string", description: "What Claude says when the call is answered" },
        voice: { type: "string", description: "Twilio voice, e.g. Polly.Joanna, Polly.Zeina (Arabic), Google.ar-XA-Standard-A" },
        language: { type: "string", description: "BCP-47 language, e.g. en-US, arb, ar-XA" },
        listen_seconds: { type: "integer", minimum: 0, maximum: 120, default: 0 },
        record: { type: "boolean", default: false },
      },
      required: ["to", "message"],
    },
    annotations: { destructiveHint: true, openWorldHint: true },
  },
  {
    name: "get_call",
    description: "Get a call's status, duration and recording links by call SID.",
    inputSchema: { type: "object", properties: { sid: { type: "string" } }, required: ["sid"] },
    annotations: { readOnlyHint: true },
  },
  {
    name: "list_calls",
    description: "List recent inbound and outbound calls on Claude's number, newest first.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "start_voice_call",
    description:
      "Start a live two-way phone conversation. An ElevenLabs voice agent calls the number from Claude's number, " +
      "talks and listens in real time to achieve the goal you give it, then hangs up. " +
      "Returns a conversation_id: read the transcript and outcome with get_voice_call once the call ends. " +
      "Outbound: costs money and reaches a real person.",
    inputSchema: {
      type: "object",
      properties: {
        to: num,
        goal: { type: "string", description: "What the call must achieve, in one or two sentences" },
        context: { type: "string", description: "Facts the agent may use: names, dates, what it may agree to" },
        first_message: { type: "string", description: "Opening line, e.g. a greeting that says it is an AI assistant" },
        language: { type: "string", description: "Agent language code, e.g. en, ar" },
      },
      required: ["to", "goal"],
    },
    annotations: { destructiveHint: true, openWorldHint: true },
  },
  {
    name: "get_voice_call",
    description: "Status, transcript, summary and success verdict of a two-way voice call by conversation_id.",
    inputSchema: {
      type: "object",
      properties: { conversation_id: { type: "string" } },
      required: ["conversation_id"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "list_voice_calls",
    description: "Recent two-way voice calls handled by the ElevenLabs agent, inbound and outbound, newest first.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
    },
    annotations: { readOnlyHint: true },
  },
];

async function runTool(name, a = {}) {
  if (name === "phone_whoami") {
    const voiceCalls = voice ? { enabled: true } : { enabled: false, missing: voiceCfg.missing };
    return cfg.missing.length
      ? { configured: false, missing: cfg.missing, two_way_voice: voiceCalls }
      : {
          configured: true,
          number: cfg.number,
          allowlist: cfg.allow.length ? cfg.allow : "any number",
          two_way_voice: voiceCalls,
        };
  }
  if (["start_voice_call", "get_voice_call", "list_voice_calls"].includes(name)) {
    if (!voice) throw new Error(`Two-way voice not configured. Set: ${voiceCfg.missing.join(", ")}`);
    if (name === "start_voice_call") {
      if (!client) throw new Error(`Phone not configured. Set: ${cfg.missing.join(", ")}`);
      return voice.startCall({ ...a, firstMessage: a.first_message });
    }
    if (name === "get_voice_call") return voice.getCall(a);
    return voice.listCalls(a);
  }
  if (!client) throw new Error(`Phone not configured. Set: ${cfg.missing.join(", ")}`);
  switch (name) {
    case "send_sms":
      return client.sendSms(a);
    case "list_messages":
      return client.listMessages(a);
    case "place_call":
      return client.placeCall({ ...a, listenSeconds: a.listen_seconds ?? 0 });
    case "get_call":
      return client.getCall(a);
    case "list_calls":
      return client.listCalls(a);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function send(msg) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");
}

async function handle(req) {
  const { id, method, params } = req;
  if (id === undefined) return; // notification
  try {
    if (method === "initialize") {
      return send({
        id,
        result: {
          protocolVersion: params?.protocolVersion || "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "agent-phone", version: "0.2.0" },
        },
      });
    }
    if (method === "ping") return send({ id, result: {} });
    if (method === "tools/list") return send({ id, result: { tools: TOOLS } });
    if (method === "tools/call") {
      try {
        const out = await runTool(params.name, params.arguments);
        return send({ id, result: { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] } });
      } catch (e) {
        return send({ id, result: { isError: true, content: [{ type: "text", text: e.message }] } });
      }
    }
    send({ id, error: { code: -32601, message: `Method not found: ${method}` } });
  } catch (e) {
    send({ id, error: { code: -32603, message: e.message } });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rl = createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let req;
    try {
      req = JSON.parse(line);
    } catch {
      return send({ id: null, error: { code: -32700, message: "Parse error" } });
    }
    handle(req);
  });
}
