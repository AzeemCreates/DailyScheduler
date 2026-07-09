# DailyScheduler

Auto-plan your day. The app looks at your goals, writes your to-do list, **ranks it by what actually matters**, and blocks it straight into your calendar. When the plan looks right, reply **"book it!"** and the blocks land in your Google Calendar.

Runs entirely **locally on your machine**, with a **local, always-on model** (Ollama) as the default planner — no API key, nothing leaves your machine except the calendar/SMS calls you opt into.

Works from four places, all backed by the same engine:

| Channel | How |
|---|---|
| Web / iOS home screen | Chat UI at `http://localhost:5050` — installable as a PWA (Share → Add to Home Screen on iPhone) |
| Terminal | `npm run cli` |
| SMS | Twilio webhook → `POST /sms` — text your plans and "book it!" from any phone |
| iOS Shortcuts / Siri | Apple Shortcut calling `POST /api/message` |

## App icon

The app looks for its icon at `public/icon.png` (referenced by `manifest.json` and the `<link rel="apple-touch-icon">` tag in `index.html`) — that file isn't checked in yet. Save a 1024×1024 PNG there and it becomes the icon everywhere: browser tab, PWA install, and the iOS home-screen icon when you "Add to Home Screen."

## How it works

1. You save goals (`add goal ship the landing page by Friday`).
2. Say `plan my day`. The planner model reads your goals, your free/busy times from Google Calendar, and your message, then returns:
   - a **ranked to-do list** — ordered by impact on your goals, with an honest reason why each item outranks the ones below it (busywork sinks to the bottom or gets cut)
   - a **time-blocked schedule** fitted into your free slots (deep work in the longest gaps, small stuff batched)
3. Reply `book it!` — every block is inserted into Google Calendar in one shot.

All state (goals, pending plans, booking history, OAuth tokens) is stored as JSON files in `data/`.

## Setup

### 1. Install and start the local model (Ollama)

```bash
# macOS
brew install ollama
ollama serve &          # starts the local API on :11434 — Ollama also keeps
                         # this running in the background automatically after
                         # a normal app install, so `ollama serve` may already
                         # be running
ollama pull qwen3:8b     # the model the app uses by default
```

Ollama installer: https://ollama.com/download. Once installed it runs as a background service, so it's "always on" — no need to restart it every time you use the app.

> Want a smaller/faster model? `ollama pull qwen3:4b` and set `OLLAMA_MODEL=qwen3:4b` in `.env`. Bigger box? `qwen3:14b` or `qwen3:30b` for better planning quality.

### 2. Install and start the app

```bash
npm install
cp .env.example .env    # defaults already point at Ollama on :11434
npm start                # web UI + API + SMS webhook on http://localhost:5050
npm run cli               # or chat in the terminal instead
```

The app talks to Ollama over plain HTTP (`http://localhost:11434` by default) — nothing to authenticate.

### 3. Connect Google Calendar (for "book it!")

1. In [Google Cloud Console](https://console.cloud.google.com/) create a project, enable the **Google Calendar API**, and create an **OAuth client (Web application)** with this exact authorized redirect URI:

   ```
   http://localhost:5050/oauth2callback
   ```

2. Put the client ID/secret in `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
3. Start the app, then open this URL in a browser to grant access:

   ```
   http://localhost:5050/auth/google
   ```

   That's the exact link — it redirects into Google's consent screen, and on approval Google sends you back to `/oauth2callback`, which stores the token in `data/google-token.json` (auto-refreshes after that; you only do this once).

The planner also reads your **free/busy** times for the day so blocks never collide with existing events.

### Using Anthropic instead of the local model (optional)

Set `PLANNER_PROVIDER=anthropic` and `ANTHROPIC_API_KEY=...` in `.env` to use Claude (Fable 5 by default) instead of Ollama — useful if you want higher planning quality than a local model, or don't want to run Ollama at all.

### SMS (Twilio)

1. Expose the local server (e.g. `ngrok http 5050`) or run it on a box with a public URL.
2. In the Twilio console, point your phone number's *"A message comes in"* webhook at `https://<your-url>/sms` (HTTP POST).
3. Text the number: `plan my day` → get the ranked plan → reply `book it!`.

### iOS

- **Home screen app:** open the web UI in Safari → Share → *Add to Home Screen*. It runs full-screen like a native app.
- **Shortcut / Siri:** create a Shortcut with *Get Contents of URL* → `POST http://<your-host>:5050/api/message`, JSON body `{"user":"ios","text":"plan my day"}` (add header `x-api-key` if you set `APP_API_KEY`), then *Show Result*. Add a second shortcut with text `book it!`. Both can be voice-triggered via Siri.
- **SMS** works natively from Messages if you set up the Twilio channel.

## Commands (any channel)

```
plan my day            → ranked to-dos + proposed time blocks
book it!               → books the proposed blocks into Google Calendar
add goal <text>        → save a goal
goals                  → list goals
remove goal <n>        → delete a goal
history                → your last 10 messages + replies (history 20 for more)
help                   → command list
```

Anything else you type is treated as a planning request with extra context, e.g. `plan my afternoon around the dentist, I need 2 hours of deep work`.

Every message and reply — on every channel — is saved to `data/history.json`, so `history` works no matter where you sent it from.

## Configuration

See `.env.example`. Notable knobs: `PLANNER_PROVIDER` (`ollama` or `anthropic`), `OLLAMA_BASE_URL`/`OLLAMA_MODEL`, `TIMEZONE`, working window `DAY_START`/`DAY_END`, `GOOGLE_CALENDAR_ID`, and `APP_API_KEY` (protects the HTTP API when exposed for the iOS Shortcut).
