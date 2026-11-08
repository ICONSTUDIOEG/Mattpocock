// Two-way voice calls through an ElevenLabs Agent on Claude's Twilio number.
// Claude sets the goal; the ElevenLabs agent holds the live conversation;
// Claude reads the transcript and summary back afterwards.

import { assertNumber, assertAllowed } from "./twilio.mjs";

const API = "https://api.elevenlabs.io/v1/convai";

export function loadVoiceConfig(env = process.env) {
  const cfg = {
    apiKey: env.ELEVENLABS_API_KEY,
    agentId: env.ELEVENLABS_AGENT_ID,
    phoneNumberId: env.ELEVENLABS_PHONE_NUMBER_ID,
    ownerName: env.CLAUDE_PHONE_OWNER_NAME || "",
  };
  cfg.missing = [
    ["ELEVENLABS_API_KEY", cfg.apiKey],
    ["ELEVENLABS_AGENT_ID", cfg.agentId],
    ["ELEVENLABS_PHONE_NUMBER_ID", cfg.phoneNumberId],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  return cfg;
}

export function buildPrompt({ goal, context, ownerName }) {
  const onBehalf = ownerName ? `on behalf of ${ownerName}` : "on behalf of the person you work for";
  return [
    `You are an AI voice assistant making a phone call ${onBehalf}.`,
    "Say early in the call that you are an AI assistant. Never claim to be human.",
    "Be brief, polite and natural. Speak in the language the other person uses.",
    "Do not agree to payments, contracts, or share personal data beyond what the goal and context below allow.",
    "If the person asks you to stop calling or is not the right person, apologise and end the call.",
    "When the goal is done, or clearly cannot be done, thank them and end the call.",
    "",
    `GOAL OF THIS CALL: ${goal}`,
    context ? `\nCONTEXT YOU MAY USE:\n${context}` : "",
  ]
    .join("\n")
    .trim();
}

export function createVoiceClient(cfg, twilioCfg, fetchImpl = globalThis.fetch) {
  async function call(method, path, body) {
    const init = { method, headers: { "xi-api-key": cfg.apiKey } };
    if (body) {
      init.body = JSON.stringify(body);
      init.headers["Content-Type"] = "application/json";
    }
    const res = await fetchImpl(`${API}${path}`, init);
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const detail = data.detail?.message || data.detail || data.message || text;
      throw new Error(`ElevenLabs ${res.status}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
    }
    return data;
  }

  return {
    async startCall({ to, goal, context, firstMessage, language }) {
      assertNumber(to);
      assertAllowed(twilioCfg, to);
      if (!goal || !String(goal).trim()) throw new Error('"goal" is empty: say what the call should achieve');
      const agent = { prompt: { prompt: buildPrompt({ goal, context, ownerName: cfg.ownerName }) } };
      if (firstMessage) agent.first_message = firstMessage;
      if (language) agent.language = language;
      const data = await call("POST", "/twilio/outbound-call", {
        agent_id: cfg.agentId,
        agent_phone_number_id: cfg.phoneNumberId,
        to_number: to,
        conversation_initiation_client_data: {
          conversation_config_override: { agent },
          dynamic_variables: { call_goal: goal, call_context: context || "", owner_name: cfg.ownerName },
        },
      });
      if (data.success === false) throw new Error(`ElevenLabs refused the call: ${data.message}`);
      return { conversation_id: data.conversation_id, call_sid: data.callSid ?? data.call_sid, to };
    },

    async getCall({ conversation_id }) {
      if (!conversation_id) throw new Error('"conversation_id" is required');
      const c = await call("GET", `/conversations/${encodeURIComponent(conversation_id)}`);
      return {
        conversation_id: c.conversation_id,
        status: c.status,
        duration_seconds: c.metadata?.call_duration_secs ?? null,
        summary: c.analysis?.transcript_summary ?? null,
        call_successful: c.analysis?.call_successful ?? null,
        transcript: (c.transcript || []).map((t) => ({
          speaker: t.role === "agent" ? "assistant" : "them",
          at_seconds: t.time_in_call_secs,
          text: t.message,
        })),
      };
    },

    async listCalls({ limit = 20 } = {}) {
      const q = new URLSearchParams({ agent_id: cfg.agentId, page_size: String(Math.min(limit, 100)) });
      const data = await call("GET", `/conversations?${q}`);
      return (data.conversations || []).map((c) => ({
        conversation_id: c.conversation_id,
        status: c.status,
        start: c.start_time_unix_secs ? new Date(c.start_time_unix_secs * 1000).toISOString() : null,
        duration_seconds: c.call_duration_secs ?? null,
        call_successful: c.call_successful ?? null,
        title: c.call_summary_title ?? null,
      }));
    },
  };
}
