import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadConfig, createClient, buildTwiml } from "../server/twilio.mjs";

const env = {
  TWILIO_ACCOUNT_SID: "AC" + "0".repeat(32),
  TWILIO_AUTH_TOKEN: "secret",
  CLAUDE_PHONE_NUMBER: "+15005550006",
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

test("loadConfig reports missing variables", () => {
  assert.deepEqual(loadConfig({}).missing, ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "CLAUDE_PHONE_NUMBER"]);
  assert.deepEqual(loadConfig(env).missing, []);
});

test("sendSms posts form data from Claude's number with Basic auth", async () => {
  const f = fakeFetch(() => ({ body: { sid: "SM1", from: env.CLAUDE_PHONE_NUMBER, to: "+201001234567", body: "hi" } }));
  const out = await createClient(loadConfig(env), f).sendSms({ to: "+201001234567", body: "hi" });
  assert.equal(out.sid, "SM1");
  const { url, init } = f.calls[0];
  assert.match(url, /\/Messages\.json$/);
  assert.equal(init.method, "POST");
  assert.match(init.headers.Authorization, /^Basic /);
  const form = new URLSearchParams(init.body);
  assert.equal(form.get("From"), env.CLAUDE_PHONE_NUMBER);
  assert.equal(form.get("To"), "+201001234567");
});

test("rejects non E.164 numbers and numbers outside the allowlist", async () => {
  const f = fakeFetch(() => ({}));
  const c = createClient(loadConfig(env), f);
  await assert.rejects(c.sendSms({ to: "01001234567", body: "x" }), /E\.164/);
  const locked = createClient(loadConfig({ ...env, CLAUDE_PHONE_ALLOWED_TO: "+201001234567" }), f);
  await assert.rejects(locked.sendSms({ to: "+14155550123", body: "x" }), /not in CLAUDE_PHONE_ALLOWED_TO/);
  assert.equal(f.calls.length, 0);
});

test("buildTwiml escapes the message and caps the listen window", () => {
  const x = buildTwiml({ message: `Tom & "Jerry" <3`, voice: "Polly.Zeina", language: "arb", listenSeconds: 500 });
  assert.equal(
    x,
    `<Response><Say voice="Polly.Zeina" language="arb">Tom &amp; &quot;Jerry&quot; &lt;3</Say><Pause length="120"/></Response>`,
  );
});

test("placeCall sends inline TwiML and the Record flag", async () => {
  const f = fakeFetch(() => ({ body: { sid: "CA1", status: "queued" } }));
  await createClient(loadConfig(env), f).placeCall({ to: "+201001234567", message: "مرحبا", record: true, listenSeconds: 10 });
  const form = new URLSearchParams(f.calls[0].init.body);
  assert.match(form.get("Twiml"), /مرحبا<\/Say><Pause length="10"\/>/);
  assert.equal(form.get("Record"), "true");
});

test("listMessages inbound filters to Claude's number", async () => {
  const f = fakeFetch(() => ({ body: { messages: [{ sid: "SM2", to: env.CLAUDE_PHONE_NUMBER, from: "+201001234567", body: "yes" }] } }));
  const out = await createClient(loadConfig(env), f).listMessages({ direction: "inbound", limit: 5 });
  assert.equal(out[0].body, "yes");
  const q = new URL(f.calls[0].url).searchParams;
  assert.equal(q.get("To"), env.CLAUDE_PHONE_NUMBER);
  assert.equal(q.get("PageSize"), "5");
});

test("Twilio errors surface their message", async () => {
  const f = fakeFetch(() => ({ status: 400, body: { message: "unverified number", code: 21608 } }));
  await assert.rejects(
    createClient(loadConfig(env), f).sendSms({ to: "+201001234567", body: "x" }),
    /Twilio 400: unverified number \(code 21608\)/,
  );
});

test("MCP server answers initialize and tools/list over stdio", async () => {
  const server = fileURLToPath(new URL("../server/index.mjs", import.meta.url));
  const child = spawn(process.execPath, [server], { env: { PATH: process.env.PATH } });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) + "\n");
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n");
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "phone_whoami", arguments: {} } }) + "\n");
  await new Promise((r) => setTimeout(r, 400));
  child.kill();
  const lines = out.trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(lines[0].result.serverInfo.name, "agent-phone");
  assert.deepEqual(
    lines[1].result.tools.map((t) => t.name),
    ["phone_whoami", "send_sms", "list_messages", "place_call", "get_call", "list_calls", "start_voice_call", "get_voice_call", "list_voice_calls"],
  );
  assert.match(lines[2].result.content[0].text, /"configured": false/);
});

test("outbound hook always asks for approval", async () => {
  const hook = fileURLToPath(new URL("../hooks/confirm-outbound.mjs", import.meta.url));
  const child = spawn(process.execPath, [hook]);
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stdin.end(JSON.stringify({ tool_name: "mcp__plugin_agent-phone_phone__place_call", tool_input: { to: "+201001234567", message: "hello" } }));
  await new Promise((r) => child.on("close", r));
  const res = JSON.parse(out).hookSpecificOutput;
  assert.equal(res.permissionDecision, "ask");
  assert.match(res.permissionDecisionReason, /CALL \+201001234567/);
});
