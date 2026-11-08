---
name: phone
description: Use Claude's own phone number to text or call people, check for replies, and read back call recordings. Use when the user asks Claude to text, SMS, call, phone, ring, or remind someone, or asks whether anyone has texted or called Claude's number.
---

# Claude's phone

You have your own phone number, provided by the `phone` MCP server. Its tools:

| Tool | What it does |
| --- | --- |
| `phone_whoami` | Your number, and whether the phone is configured |
| `send_sms` | Text a number |
| `list_messages` | Read texts to or from your number (`inbound`, `outbound`, `all`; filter `with` a number) |
| `place_call` | Call a number and speak a message (text-to-speech) |
| `get_call` | Status, duration and recording links for one call |
| `list_calls` | Recent inbound and outbound calls |

## Rules

1. **Run `phone_whoami` first** in a session. If it says `configured: false`, stop and tell the user which variables are missing; point them at the plugin README. Do not try to work around it.
2. **Every outbound text or call is shown to the user for approval** by the plugin's hook. Before calling `send_sms` or `place_call`, write out exactly who you are contacting and what you will say, so the approval prompt holds no surprises.
3. **Numbers are E.164** (`+201001234567`, `+14155550123`). If the user gives a local number, convert it and say which country code you assumed. If you cannot tell the country, ask.
4. **Identify yourself.** The first message to someone new says it is an AI assistant writing on the user's behalf, and names the user. Never pretend to be a human.
5. **Never contact anyone the user did not name**, and never send the same message to a list of people without the user confirming the list.
6. **Keep spoken messages short** (under about 40 seconds of speech). Spell out numbers, times and codes the way they should be read aloud.

## Calls are announcements, not conversations

`place_call` speaks your message and can then keep the line open (`listen_seconds`) and record (`record: true`) whatever the other person says. It cannot hear and reply in real time. To collect an answer:

1. `place_call` with `listen_seconds` (e.g. 20) and `record: true`. End the message with a clear prompt: "Please say your answer after this message."
2. Wait for the call to finish, then `get_call` with the returned `sid`.
3. Report the status and give the user the recording link. You cannot listen to the audio yourself unless another tool can transcribe it.

Calls that end `no-answer`, `busy` or `failed` are normal: say so and offer to text instead.

## Arabic

Twilio speaks Arabic with `voice: "Polly.Zeina"` + `language: "arb"`, or `voice: "Google.ar-XA-Standard-A"` + `language: "ar-XA"`. Write the message in Arabic script. Texts in Arabic are sent as Unicode SMS, which fits 70 characters per segment instead of 160, so long Arabic texts cost more segments.

## Checking for replies

When the user asks "did anyone reply?", use `list_messages` with `direction: "inbound"` (and `with` the number if they mean one person). Your number is not watched in real time; replies are only seen when you check.
