#!/usr/bin/env node
// Forces a human approval prompt before every outbound text or call,
// whatever permission mode the session is in. Reaching a real person
// costs money and cannot be undone, so it never runs unattended.
let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let input = {};
  try {
    input = JSON.parse(raw);
  } catch {}
  const tool = String(input.tool_name || "");
  const a = input.tool_input || {};
  const what = tool.endsWith("place_call")
    ? `Claude wants to CALL ${a.to} and say: "${a.message}"${a.record ? " (recording on)" : ""}`
    : `Claude wants to TEXT ${a.to}: "${a.body}"`;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: what,
      },
    }),
  );
});
