import express from "express";
import { config } from "./config.js";
import { handleMessage } from "./engine.js";
import * as cal from "./calendar.js";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // Twilio posts form-encoded
app.use(express.static(new URL("../public/", import.meta.url).pathname));

function checkApiKey(req, res) {
  if (!config.apiKey) return true;
  const key = req.get("x-api-key") || req.query.key;
  if (key === config.apiKey) return true;
  res.status(401).json({ error: "unauthorized" });
  return false;
}

// --- Chat API (web UI + iOS Shortcuts) --------------------------------------
app.post("/api/message", async (req, res) => {
  if (!checkApiKey(req, res)) return;
  try {
    const { user = "web", text = "" } = req.body || {};
    const reply = await handleMessage(String(user), String(text));
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/status", (req, res) => {
  res.json({
    model: config.model,
    timezone: config.timezone,
    googleConfigured: cal.isConfigured(),
    googleConnected: cal.isConnected(),
  });
});

// --- Google Calendar OAuth ---------------------------------------------------
app.get("/auth/google", (req, res) => {
  try {
    res.redirect(cal.getAuthUrl());
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get("/oauth2callback", async (req, res) => {
  try {
    await cal.handleOAuthCallback(String(req.query.code));
    res.send("Google Calendar connected. You can close this tab and reply \"book it!\" anywhere.");
  } catch (err) {
    res.status(500).send(`OAuth failed: ${err.message}`);
  }
});

// --- SMS (Twilio inbound webhook) ---------------------------------------------
// Point a Twilio phone number's "A message comes in" webhook at POST /sms.
const xmlEscape = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

app.post("/sms", async (req, res) => {
  const from = req.body.From || "sms";
  const body = req.body.Body || "";
  let reply;
  try {
    reply = await handleMessage(`sms:${from}`, body, { compact: true });
  } catch (err) {
    reply = `Something went wrong: ${err.message}`;
  }
  // SMS segments are small — trim very long replies.
  if (reply.length > 1500) reply = reply.slice(0, 1490) + "\n(truncated)";
  res.type("text/xml").send(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xmlEscape(reply)}</Message></Response>`
  );
});

app.listen(config.port, () => {
  console.log(`DailyScheduler running at http://localhost:${config.port}`);
  console.log(`Model: ${config.model} | Timezone: ${config.timezone}`);
  if (!cal.isConfigured()) {
    console.log("Google Calendar: set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET to enable booking.");
  } else if (!cal.isConnected()) {
    console.log(`Google Calendar: visit http://localhost:${config.port}/auth/google to connect.`);
  }
});
