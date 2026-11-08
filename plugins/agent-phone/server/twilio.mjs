// Thin Twilio REST client. No SDK, no dependencies: just fetch + Basic auth.
// Everything here works without a public webhook server: inbound texts,
// call status and recordings are all read back from Twilio's own logs.

const API = "https://api.twilio.com/2010-04-01";
const E164 = /^\+[1-9]\d{6,14}$/;

export function loadConfig(env = process.env) {
  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  const number = env.CLAUDE_PHONE_NUMBER;
  const missing = [];
  if (!sid) missing.push("TWILIO_ACCOUNT_SID");
  if (!token) missing.push("TWILIO_AUTH_TOKEN");
  if (!number) missing.push("CLAUDE_PHONE_NUMBER");
  const allow = (env.CLAUDE_PHONE_ALLOWED_TO || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    sid,
    token,
    number,
    allow,
    defaultVoice: env.CLAUDE_PHONE_VOICE || "Polly.Joanna",
    defaultLanguage: env.CLAUDE_PHONE_LANGUAGE || "en-US",
    missing,
  };
}

export function assertNumber(n, label = "to") {
  if (typeof n !== "string" || !E164.test(n)) {
    throw new Error(
      `"${label}" must be an E.164 phone number like +201001234567 (got ${JSON.stringify(n)})`,
    );
  }
}

export function assertAllowed(cfg, to) {
  if (cfg.allow.length && !cfg.allow.includes(to)) {
    throw new Error(
      `${to} is not in CLAUDE_PHONE_ALLOWED_TO. Add it there to let Claude contact this number.`,
    );
  }
}

export function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildTwiml({ message, voice, language, listenSeconds }) {
  const say = `<Say voice="${escapeXml(voice)}" language="${escapeXml(language)}">${escapeXml(message)}</Say>`;
  const listen = listenSeconds > 0 ? `<Pause length="${Math.min(listenSeconds, 120)}"/>` : "";
  return `<Response>${say}${listen}</Response>`;
}

export function createClient(cfg, fetchImpl = globalThis.fetch) {
  const auth = "Basic " + Buffer.from(`${cfg.sid}:${cfg.token}`).toString("base64");
  const base = `${API}/Accounts/${cfg.sid}`;

  async function call(method, path, params) {
    let url = `${base}${path}`;
    const init = { method, headers: { Authorization: auth } };
    if (method === "GET" && params) {
      url += "?" + new URLSearchParams(params).toString();
    } else if (params) {
      init.body = new URLSearchParams(params).toString();
      init.headers["Content-Type"] = "application/x-www-form-urlencoded";
    }
    const res = await fetchImpl(url, init);
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      throw new Error(`Twilio ${res.status}: ${data.message || text} (code ${data.code ?? "n/a"})`);
    }
    return data;
  }

  const pickMsg = (m) => ({
    sid: m.sid,
    direction: m.direction,
    from: m.from,
    to: m.to,
    body: m.body,
    status: m.status,
    date: m.date_sent || m.date_created,
  });

  const pickCall = (c) => ({
    sid: c.sid,
    direction: c.direction,
    from: c.from,
    to: c.to,
    status: c.status,
    duration_seconds: c.duration ? Number(c.duration) : null,
    start: c.start_time,
  });

  return {
    async sendSms({ to, body }) {
      assertNumber(to);
      assertAllowed(cfg, to);
      if (!body || !String(body).trim()) throw new Error('"body" is empty');
      const m = await call("POST", "/Messages.json", { To: to, From: cfg.number, Body: body });
      return pickMsg(m);
    },

    async listMessages({ direction = "inbound", with: peer, limit = 20 } = {}) {
      const params = { PageSize: String(Math.min(limit, 100)) };
      if (direction === "inbound") params.To = cfg.number;
      if (direction === "outbound") params.From = cfg.number;
      const data = await call("GET", "/Messages.json", params);
      let msgs = (data.messages || []).map(pickMsg);
      if (direction === "all") {
        msgs = msgs.filter((m) => m.to === cfg.number || m.from === cfg.number);
      }
      if (peer) msgs = msgs.filter((m) => m.to === peer || m.from === peer);
      return msgs;
    },

    async placeCall({ to, message, voice, language, listenSeconds = 0, record = false }) {
      assertNumber(to);
      assertAllowed(cfg, to);
      if (!message || !String(message).trim()) throw new Error('"message" is empty');
      const twiml = buildTwiml({
        message,
        voice: voice || cfg.defaultVoice,
        language: language || cfg.defaultLanguage,
        listenSeconds,
      });
      const params = { To: to, From: cfg.number, Twiml: twiml };
      if (record) params.Record = "true";
      const c = await call("POST", "/Calls.json", params);
      return { ...pickCall(c), recorded: record };
    },

    async getCall({ sid }) {
      if (!/^CA[0-9a-f]{32}$/i.test(sid || "")) throw new Error('"sid" must be a Twilio call SID (CA...)');
      const c = await call("GET", `/Calls/${sid}.json`);
      const r = await call("GET", `/Calls/${sid}/Recordings.json`);
      const recordings = (r.recordings || []).map((x) => ({
        sid: x.sid,
        duration_seconds: Number(x.duration),
        url: `${base}/Recordings/${x.sid}.mp3`,
      }));
      return { ...pickCall(c), recordings };
    },

    async listCalls({ limit = 20 } = {}) {
      const size = String(Math.min(limit, 100));
      const [inb, outb] = await Promise.all([
        call("GET", "/Calls.json", { To: cfg.number, PageSize: size }),
        call("GET", "/Calls.json", { From: cfg.number, PageSize: size }),
      ]);
      return [...(inb.calls || []), ...(outb.calls || [])]
        .map(pickCall)
        .sort((a, b) => new Date(b.start || 0) - new Date(a.start || 0))
        .slice(0, limit);
    },
  };
}
