# agent-phone

A Claude Code plugin that gives Claude its own phone number. Claude can text people, read the texts that come back, call someone and speak a message, and give you a recording of what they said afterwards.

This plugin is separate from `mattpocock-skills`. It is not part of that plugin's manifest or marketplace.

## What Claude can do with it

| Tool | What it does |
| --- | --- |
| `phone_whoami` | Shows Claude's number and whether the phone is set up |
| `send_sms` | Texts a number |
| `list_messages` | Reads texts to or from Claude's number |
| `place_call` | Calls a number and speaks a message (Arabic and English voices included), with optional listening window and recording |
| `get_call` | Status, duration and recording links for one call |
| `list_calls` | Recent inbound and outbound calls |

Every `send_sms` and `place_call` brings up an approval prompt showing who Claude is contacting and exactly what it will say. A plugin hook does this, so it happens in every permission mode, auto mode included.

## What it does not do (yet)

- **No live two-way voice conversation.** A call is a spoken announcement, optionally followed by a recorded reply. Real-time talk needs a streaming voice agent (for example ElevenLabs Agents or Twilio ConversationRelay) running on a public server.
- **No push notifications for incoming texts or calls.** Claude sees replies only when it checks with `list_messages` or `list_calls`. Nothing has to be hosted for this to work, which is the point.
- **No transcription.** Claude gets a link to the recording; it cannot listen to it.

## Setup

1. **Get a Twilio account and number.** Sign up at twilio.com and buy a number with Voice and SMS. A US or UK number is the easiest start. On a trial account, Twilio only lets you call and text numbers you have verified in the console.
2. **Set three environment variables** where Claude Code runs (shell profile, or `env` in `~/.claude/settings.json`):

   ```bash
   export TWILIO_ACCOUNT_SID=AC...        # Twilio console, Account Info
   export TWILIO_AUTH_TOKEN=...           # same place; keep it secret
   export CLAUDE_PHONE_NUMBER=+14155550123  # the number you bought, E.164
   ```

   Optional:

   ```bash
   export CLAUDE_PHONE_ALLOWED_TO=+201001234567,+201112223334  # only these numbers can be contacted
   export CLAUDE_PHONE_VOICE=Polly.Zeina   # default text-to-speech voice
   export CLAUDE_PHONE_LANGUAGE=arb        # default language for that voice
   ```

   Setting `CLAUDE_PHONE_ALLOWED_TO` is strongly recommended. With it, Claude cannot reach any number outside the list even if you approve the prompt by mistake.

3. **Load the plugin.** From a clone of this repo:

   ```bash
   claude --plugin-dir ./plugins/agent-phone
   ```

4. **Check it works.** Ask Claude: "What's your phone number?" It runs `phone_whoami`. Then: "Text me at +20... saying hello." Approve the prompt, and your phone should buzz.

Requires Node 18 or newer. No npm install: the server has no dependencies.

## Example requests

- "Text Karim at +201001234567 that the render farm is back up."
- "Call +201001234567 and tell him in Arabic the meeting moved to 4 pm. Leave 20 seconds for a reply and record it."
- "Has anyone texted you since this morning?"
- "How did that last call go?"

## Costs and rules worth knowing

- Twilio bills per text segment and per call minute, and charges a monthly fee per number. International calls and texts to Egypt cost noticeably more than US domestic ones. Check Twilio's pricing page for your destinations.
- Arabic texts use Unicode SMS: 70 characters per segment instead of 160.
- Calling or texting people with an automated or AI voice is regulated. In the US, prior consent is required for AI-voice calls; in Egypt, the NTRA restricts VoIP traffic, and SMS sender rules vary by carrier. Only contact people who expect to hear from you.

## Development

```bash
cd plugins/agent-phone
npm test                          # unit tests, no network
claude plugin validate . --strict
```

The server is `server/index.mjs` (MCP over stdio) and `server/twilio.mjs` (Twilio REST calls). The approval hook is `hooks/confirm-outbound.mjs`. The skill that teaches Claude how to use the phone is `skills/phone/SKILL.md`.
