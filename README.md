# DailyScheduler

Auto-plan your day. The app looks at your goals, writes your to-do list, **ranks it by what actually matters**, and blocks it straight into your calendar. When the plan looks right, reply **"book it!"** and the blocks land in your Google Calendar.

Works from four places, all backed by the same engine and all running **locally on your machine**:

| Channel | How |
|---|---|
| Web / iOS home screen | Chat UI at `http://localhost:3000` — installable as a PWA (Share → Add to Home Screen on iPhone) |
| Terminal | `npm run cli` |
| SMS | Twilio webhook → `POST /sms` — text your plans and "book it!" from any phone |
| iOS Shortcuts / Siri | Apple Shortcut calling `POST /api/message` |

## How it works

1. You save goals (`add goal ship the landing page by Friday`).
2. Say `plan my day`. The planner model reads your goals, your free/busy times from Google Calendar, and your message, then returns:
   - a **ranked to-do list** — ordered by impact on your goals, with an honest reason why each item outranks the ones below it (busywork sinks to the bottom or gets cut)
   - a **time-blocked schedule** fitted into your free slots (deep work in the longest gaps, small stuff batched)
3. Reply `book it!` — every block is inserted into Google Calendar in one shot.

All state (goals, pending plans, booking history, OAuth tokens) is stored as JSON files in `data/` — nothing leaves your machine except the API calls to Anthropic, Google, and (optionally) Twilio.

## Setup

```bash
npm install
cp .env.example .env   # fill in ANTHROPIC_API_KEY at minimum
npm start              # web UI + API + SMS webhook on :3000
npm run cli            # or chat in the terminal
```

### Google Calendar (for "book it!")

1. In [Google Cloud Console](https://console.cloud.google.com/) create a project, enable the **Google Calendar API**, and create an **OAuth client (Web application)** with `http://localhost:3000/oauth2callback` as an authorized redirect URI.
2. Put the client ID/secret in `.env`.
3. Start the server and open `http://localhost:3000/auth/google` once to grant access. The token is saved to `data/google-token.json` and refreshes automatically.

The planner also reads your **free/busy** times for the day so blocks never collide with existing events.

### SMS (Twilio)

1. Expose the local server (e.g. `ngrok http 3000`) or run it on a box with a public URL.
2. In the Twilio console, point your phone number's *"A message comes in"* webhook at `https://<your-url>/sms` (HTTP POST).
3. Text the number: `plan my day` → get the ranked plan → reply `book it!`.

### iOS

- **Home screen app:** open the web UI in Safari → Share → *Add to Home Screen*. It runs full-screen like a native app.
- **Shortcut / Siri:** create a Shortcut with *Get Contents of URL* → `POST http://<your-host>:3000/api/message`, JSON body `{"user":"ios","text":"plan my day"}` (add header `x-api-key` if you set `APP_API_KEY`), then *Show Result*. Add a second shortcut with text `book it!`. Both can be voice-triggered via Siri.
- **SMS** works natively from Messages if you set up the Twilio channel.

## Commands (any channel)

```
plan my day            → ranked to-dos + proposed time blocks
book it!               → books the proposed blocks into Google Calendar
add goal <text>        → save a goal
goals                  → list goals
remove goal <n>        → delete a goal
help                   → command list
```

Anything else you type is treated as a planning request with extra context, e.g. `plan my afternoon around the dentist, I need 2 hours of deep work`.

## Configuration

See `.env.example`. Notable knobs: `TIMEZONE`, working window `DAY_START`/`DAY_END`, `GOOGLE_CALENDAR_ID`, and `APP_API_KEY` (protects the HTTP API when exposed for the iOS Shortcut). The planner model can be swapped via `ANTHROPIC_MODEL`.
