import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../server/twilio.mjs";
import { loadVoiceConfig, createVoiceClient, buildPrompt } from "../server/elevenlabs.mjs";

const twilioEnv = {
  TWILIO_ACCOUNT_SID: "AC" + "0".repeat(32),
  TWILIO_AUTH_TOKEN: "secret",
  CLAUDE_PHONE_NUMBER: "+15005550006",
};
const voiceEnv = {
  ELEVENLABS_API_KEY: "xi-key",
  ELEVENLABS_AGENT_ID: "agent_1",
  ELEVENLABS_PHONE_NUMBER_ID: "phnum_1",
  CLAUDE_PHONE_OWNER_NAME: "Dr. Ashraf Ahmed",
};

function fakeFetch(responder) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init });
    const { status = 200, body = {} } = responder(url, init) || {};
    return { ok: status < 400, status, text: async () => JSON.stringify(body) };
  };
  f.calls = calls;
  return f;
}

const client = (f, extra = {}) =>
  createVoiceClient(loadVoiceConfig(voiceEnv), loadConfig({ ...twilioEnv, ...extra }), f);

test("loadVoiceConfig reports missing ElevenLabs variables", () => {
  assert.deepEqual(loadVoiceConfig({}).missing, ["ELEVENLABS_API_KEY", "ELEVENLABS_AGENT_ID", "ELEVENLABS_PHONE_NUMBER_ID"]);
  assert.deepEqual(loadVoiceConfig(voiceEnv).missing, []);
});

test("buildPrompt carries the goal, context, owner and AI disclosure", () => {
  const p = buildPrompt({ goal: "Confirm Tuesday's recording session", context: "Studio B, 10 am", ownerName: "Dr. Ashraf Ahmed" });
  assert.match(p, /on behalf of Dr\. Ashraf Ahmed/);
  assert.match(p, /Never claim to be human/);
  assert.match(p, /GOAL OF THIS CALL: Confirm Tuesday's recording session/);
  assert.match(p, /Studio B, 10 am/);
});

test("startCall posts the outbound call with prompt override and API key", async () => {
  const f = fakeFetch(() => ({ body: { success: true, conversation_id: "conv_1", callSid: "CA1" } }));
  const out = await client(f).startCall({
    to: "+201001234567",
    goal: "Book a table for two at 8 pm",
    firstMessage: "مرحبا، أنا مساعد ذكي",
    language: "ar",
  });
  assert.deepEqual(out, { conversation_id: "conv_1", call_sid: "CA1", to: "+201001234567" });
  const { url, init } = f.calls[0];
  assert.equal(url, "https://api.elevenlabs.io/v1/convai/twilio/outbound-call");
  assert.equal(init.headers["xi-api-key"], "xi-key");
  const body = JSON.parse(init.body);
  assert.equal(body.agent_id, "agent_1");
  assert.equal(body.agent_phone_number_id, "phnum_1");
  assert.equal(body.to_number, "+201001234567");
  const agent = body.conversation_initiation_client_data.conversation_config_override.agent;
  assert.match(agent.prompt.prompt, /Book a table for two at 8 pm/);
  assert.equal(agent.first_message, "مرحبا، أنا مساعد ذكي");
  assert.equal(agent.language, "ar");
  assert.equal(body.conversation_initiation_client_data.dynamic_variables.call_goal, "Book a table for two at 8 pm");
});

test("startCall respects E.164, the allowlist and a required goal, before any request", async () => {
  const f = fakeFetch(() => ({}));
  await assert.rejects(client(f).startCall({ to: "0100", goal: "x" }), /E\.164/);
  await assert.rejects(client(f).startCall({ to: "+201001234567", goal: " " }), /"goal" is empty/);
  await assert.rejects(
    client(f, { CLAUDE_PHONE_ALLOWED_TO: "+201112223334" }).startCall({ to: "+201001234567", goal: "x" }),
    /not in CLAUDE_PHONE_ALLOWED_TO/,
  );
  assert.equal(f.calls.length, 0);
});

test("startCall surfaces ElevenLabs refusals and HTTP errors", async () => {
  await assert.rejects(
    client(fakeFetch(() => ({ body: { success: false, message: "number not verified" } }))).startCall({ to: "+201001234567", goal: "x" }),
    /refused the call: number not verified/,
  );
  await assert.rejects(
    client(fakeFetch(() => ({ status: 403, body: { detail: { message: "Override for field 'prompt' is not allowed" } } }))).startCall({ to: "+201001234567", goal: "x" }),
    /ElevenLabs 403: Override for field 'prompt' is not allowed/,
  );
});

test("getCall maps the transcript, summary and outcome", async () => {
  const f = fakeFetch(() => ({
    body: {
      conversation_id: "conv_1",
      status: "done",
      metadata: { call_duration_secs: 74 },
      analysis: { transcript_summary: "Table booked for 8 pm.", call_successful: "success" },
      transcript: [
        { role: "agent", message: "Hello, I'm an AI assistant.", time_in_call_secs: 0 },
        { role: "user", message: "Hi, how can I help?", time_in_call_secs: 3 },
      ],
    },
  }));
  const out = await client(f).getCall({ conversation_id: "conv_1" });
  assert.match(f.calls[0].url, /\/conversations\/conv_1$/);
  assert.equal(out.status, "done");
  assert.equal(out.duration_seconds, 74);
  assert.equal(out.summary, "Table booked for 8 pm.");
  assert.deepEqual(out.transcript[1], { speaker: "them", at_seconds: 3, text: "Hi, how can I help?" });
});

test("listCalls filters by agent and converts timestamps", async () => {
  const f = fakeFetch(() => ({
    body: { conversations: [{ conversation_id: "conv_2", status: "done", start_time_unix_secs: 1700000000, call_duration_secs: 30 }] },
  }));
  const out = await client(f).listCalls({ limit: 5 });
  const q = new URL(f.calls[0].url).searchParams;
  assert.equal(q.get("agent_id"), "agent_1");
  assert.equal(q.get("page_size"), "5");
  assert.equal(out[0].start, "2023-11-14T22:13:20.000Z");
});

test("voice tools report missing configuration through the MCP server", async () => {
  const server = fileURLToPath(new URL("../server/index.mjs", import.meta.url));
  const child = spawn(process.execPath, [server], { env: { PATH: process.env.PATH, ...twilioEnv } });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "start_voice_call", arguments: { to: "+201001234567", goal: "x" } } }) + "\n");
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "phone_whoami", arguments: {} } }) + "\n");
  await new Promise((r) => setTimeout(r, 400));
  child.kill();
  const [a, b] = out.trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(a.result.isError, true);
  assert.match(a.result.content[0].text, /Two-way voice not configured. Set: ELEVENLABS_API_KEY/);
  assert.match(b.result.content[0].text, /"enabled": false/);
});

test("outbound hook asks before a live voice call and shows the goal", async () => {
  const hook = fileURLToPath(new URL("../hooks/confirm-outbound.mjs", import.meta.url));
  const child = spawn(process.execPath, [hook]);
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stdin.end(JSON.stringify({ tool_name: "mcp__plugin_agent-phone_phone__start_voice_call", tool_input: { to: "+201001234567", goal: "Confirm the shoot" } }));
  await new Promise((r) => child.on("close", r));
  const res = JSON.parse(out).hookSpecificOutput;
  assert.equal(res.permissionDecision, "ask");
  assert.match(res.permissionDecisionReason, /LIVE CALL with \+201001234567. Goal: "Confirm the shoot"/);
});
