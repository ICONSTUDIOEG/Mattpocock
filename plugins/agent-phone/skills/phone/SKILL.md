---
name: phone
description: Use Claude's own phone number to text or call people, hold live two-way voice calls through a voice agent, check for replies, and read back transcripts and recordings. Use when the user asks Claude to text, SMS, call, phone, ring, book, confirm, or remind someone, or asks whether anyone has texted or called Claude's number.
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
| `start_voice_call` | A live two-way call: a voice agent talks and listens until your goal is done |
| `get_voice_call` | Transcript, summary and outcome of a live call |
| `list_voice_calls` | Recent live calls, including people who called Claude's number |

## Rules

1. **Run `phone_whoami` first** in a session. If it says `configured: false`, stop and tell the user which variables are missing; point them at the plugin README. Do not try to work around it.
2. **Every outbound text or call (spoken or live) is shown to the user for approval** by the plugin's hook. Before calling `send_sms`, `place_call` or `start_voice_call`, write out exactly who you are contacting and what you will say, so the approval prompt holds no surprises.
3. **Numbers are E.164** (`+201001234567`, `+14155550123`). If the user gives a local number, convert it and say which country code you assumed. If you cannot tell the country, ask.
4. **Identify yourself.** The first message to someone new says it is an AI assistant writing on the user's behalf, and names the user. Never pretend to be a human.
5. **Never contact anyone the user did not name**, and never send the same message to a list of people without the user confirming the list.
6. **Keep spoken messages short** (under about 40 seconds of speech). Spell out numbers, times and codes the way they should be read aloud.

## Choosing a call type

- **The call needs a back-and-forth** (book, confirm, ask a question, negotiate a time): use `start_voice_call`, if `phone_whoami` shows `two_way_voice.enabled: true`.
- **One-way news** ("your render is ready", "the meeting moved"): use `place_call`. It is cheaper and more predictable.
- **Not urgent, or the person may not pick up**: text instead.

## Live two-way calls

`start_voice_call` hands the call to an ElevenLabs voice agent that holds the conversation in real time. You are not on the line: you set it up, then read the result.

1. **Write a tight `goal`**: one outcome, in one or two sentences. "Confirm Karim can deliver the sound mix by Thursday 5 pm; if not, get his earliest date." Not "talk to Karim about the project."
2. **Put every fact it may use in `context`**: names, dates, addresses, what it may agree to, and what it must not. The agent knows only the goal and context. Anything you leave out, it will not say; anything you put in, it may say.
3. **Set `language`** (`ar` or `en`) and a `first_message` in that language that greets the person, names the user, and says it is an AI assistant.
4. After the call, `get_voice_call` with the `conversation_id`. While `status` is not `done` or `failed`, the call is still going: wait and check again rather than reporting early.
5. Report the outcome from the transcript, not the summary alone. Quote what the other person actually agreed to. If `call_successful` is `failure` or the transcript shows the goal was missed, say so plainly and propose the next step.

People who call Claude's number are answered by the same voice agent. Use `list_voice_calls` to see those calls and `get_voice_call` to read them.

## Spoken announcements

`place_call` speaks your message and can then keep the line open (`listen_seconds`) and record (`record: true`) whatever the other person says. It cannot hear and reply in real time. To collect an answer:

1. `place_call` with `listen_seconds` (e.g. 20) and `record: true`. End the message with a clear prompt: "Please say your answer after this message."
2. Wait for the call to finish, then `get_call` with the returned `sid`.
3. Report the status and give the user the recording link. You cannot listen to the audio yourself unless another tool can transcribe it.

Calls (of either type) that end `no-answer`, `busy` or `failed` are normal: say so and offer to text instead.

## Arabic

Twilio speaks Arabic with `voice: "Polly.Zeina"` + `language: "arb"`, or `voice: "Google.ar-XA-Standard-A"` + `language: "ar-XA"`. Write the message in Arabic script. Texts in Arabic are sent as Unicode SMS, which fits 70 characters per segment instead of 160, so long Arabic texts cost more segments.

## Checking for replies

When the user asks "did anyone reply?", use `list_messages` with `direction: "inbound"` (and `with` the number if they mean one person). Your number is not watched in real time; replies are only seen when you check.
