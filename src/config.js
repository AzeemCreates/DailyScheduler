import "dotenv/config";

export const config = {
  port: Number(process.env.PORT || 5050),

  // Which planner backend to use: "anthropic" (hosted) or "ollama" (local,
  // always-running model — no API key, nothing leaves the machine).
  provider: (process.env.PLANNER_PROVIDER || "ollama").toLowerCase(),

  // Anthropic backend. Fable 5 is the default; when it is the active model
  // the planner also opts into the server-side Opus 4.8 fallback so a rare
  // classifier decline never fails a planning request outright.
  model: process.env.ANTHROPIC_MODEL || "claude-fable-5",
  fallbackModel: process.env.ANTHROPIC_FALLBACK_MODEL || "claude-opus-4-8",

  // Ollama backend (local). Point OLLAMA_BASE_URL at wherever `ollama serve`
  // is running — defaults to Ollama's standard local port.
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    model: process.env.OLLAMA_MODEL || "qwen3:8b",
  },

  timezone:
    process.env.TIMEZONE ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "UTC",

  // Planning window used when blocking out the day.
  dayStart: process.env.DAY_START || "08:00",
  dayEnd: process.env.DAY_END || "21:00",

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ||
      `http://localhost:${process.env.PORT || 5050}/oauth2callback`,
    calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
  },

  // Optional shared secret for the HTTP API (used by the iOS Shortcut).
  apiKey: process.env.APP_API_KEY || "",

  dataDir: new URL("../data/", import.meta.url).pathname,
};
