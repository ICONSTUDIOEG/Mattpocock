# agent-phone

A Claude Code plugin that gives Claude its own phone number. Claude can text people and read the replies, call someone and speak a message, and hold **live two-way phone conversations** through an ElevenLabs voice agent, then read you the transcript.

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
| `start_voice_call` | Live two-way call: an ElevenLabs voice agent talks and listens until the goal Claude sets is done |
| `get_voice_call` | Transcript, summary and success verdict of a live call |
| `list_voice_calls` | Recent live calls, inbound included |

Every `send_sms`, `place_call` and `start_voice_call` brings up an approval prompt showing who Claude is contacting and exactly what it will say. A plugin hook does this, so it happens in every permission mode, auto mode included.

## How a live call works

```
Claude ──goal + context──▶ ElevenLabs agent ──Twilio──▶ the person's phone
                              (talks and listens in real time)
Claude ◀──transcript + summary + verdict── ElevenLabs
```

Claude is not on the line. It writes the brief, the agent holds the conversation, and Claude reads the transcript afterwards and reports back. The agent knows only what Claude puts in the goal and context. Inbound calls to the number are answered by the same agent.

## What it does not do (yet)

- **No push notifications for incoming texts or calls.** Claude sees them only when it checks. Nothing has to be hosted for this to work, which is the point.
- **Claude can't step into a live call.** If the conversation goes off-script, the voice agent improvises within its brief. Claude sees the result only after the call ends.
- **No transcription for `place_call` recordings.** Live calls (`start_voice_call`) come with a full transcript; one-way calls only give a recording link.

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

4. **Optional: turn on live two-way calls (ElevenLabs).** See the next section.

5. **Check it works.** Ask Claude: "What's your phone number?" It runs `phone_whoami`. Then: "Text me at +20... saying hello." Approve the prompt, and your phone should buzz.

### Live two-way calls with ElevenLabs

1. **Create an agent** in ElevenLabs (Agents Platform, or the ElevenLabs connector in Claude). Pick a voice, preferably one that handles both Arabic and English. Its base prompt hardly matters: each call replaces it with Claude's brief.
2. **Allow overrides.** In the agent's **Security** tab, enable overrides for **System prompt**, **First message** and **Language**. Without this, every call fails with `Override for field ... is not allowed`.
3. **Import the Twilio number.** In **Phone Numbers**, choose Import from Twilio and enter the same number, Account SID and Auth Token. Assign the agent to it. Copy the phone number ID it shows.
4. **Set:**

   ```bash
   export ELEVENLABS_API_KEY=...                 # ElevenLabs, Developers, API keys
   export ELEVENLABS_AGENT_ID=agent_...
   export ELEVENLABS_PHONE_NUMBER_ID=phnum_...
   export CLAUDE_PHONE_OWNER_NAME="Dr. Ashraf Ahmed"   # who the agent says it is calling for
   ```

5. Ask Claude "What's your phone number?" again. `two_way_voice` should read `enabled: true`.

**Side effect of step 3:** importing the number makes ElevenLabs answer every inbound call to it. That's usually what you want, since callers reach the agent. Outbound `place_call` and all texting keep working unchanged.

Requires Node 18 or newer. No npm install: the server has no dependencies.

## Example requests

- "Text Karim at +201001234567 that the render farm is back up."
- "Call +201001234567 and tell him in Arabic the meeting moved to 4 pm. Leave 20 seconds for a reply and record it."
- "Has anyone texted you since this morning?"
- "How did that last call go?"
- "Call the studio at +20... and book Studio B for Tuesday 10 am to 2 pm. We can pay up to 3,000 EGP. Speak Arabic."
- "Phone Karim and find out whether the sound mix will be ready by Thursday. Tell me exactly what he says."
- "Did anyone call your number today? What did they want?"

## Costs and rules worth knowing

- Twilio bills per text segment and per call minute, and charges a monthly fee per number. Live calls also use ElevenLabs agent minutes on top of Twilio's per-minute rate. International calls and texts to Egypt cost noticeably more than US domestic ones. Check Twilio's pricing page for your destinations.
- Arabic texts use Unicode SMS: 70 characters per segment instead of 160.
- Calling or texting people with an automated or AI voice is regulated. In the US, prior consent is required for AI-voice calls; in Egypt, the NTRA restricts VoIP traffic, and SMS sender rules vary by carrier. Only contact people who expect to hear from you.

## Development

```bash
cd plugins/agent-phone
npm test                          # unit tests, no network
claude plugin validate . --strict
```

The server is `server/index.mjs` (MCP over stdio), with `server/twilio.mjs` (Twilio REST calls) and `server/elevenlabs.mjs` (live voice calls). The approval hook is `hooks/confirm-outbound.mjs`. The skill that teaches Claude how to use the phone is `skills/phone/SKILL.md`.
