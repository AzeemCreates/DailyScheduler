import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";
import { config } from "./config.js";

const TOKEN_PATH = path.join(config.dataDir, "google-token.json");

function oauthClient() {
  const { clientId, clientSecret, redirectUri } = config.google;
  if (!clientId || !clientSecret) return null;
  const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  try {
    client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8")));
  } catch {
    // not connected yet
  }
  client.on("tokens", (tokens) => {
    // Persist refreshed tokens so the connection survives restarts.
    const existing = (() => {
      try {
        return JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
      } catch {
        return {};
      }
    })();
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...existing, ...tokens }, null, 2));
  });
  return client;
}

export function isConfigured() {
  return Boolean(config.google.clientId && config.google.clientSecret);
}

export function isConnected() {
  return isConfigured() && fs.existsSync(TOKEN_PATH);
}

export function getAuthUrl() {
  const client = oauthClient();
  if (!client) throw new Error("Google OAuth is not configured (set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).");
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.freebusy"],
  });
}

export async function handleOAuthCallback(code) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
}

function calendarApi() {
  const client = oauthClient();
  if (!client || !isConnected()) {
    throw new Error("Google Calendar is not connected yet. Open /auth/google in a browser to connect.");
  }
  return google.calendar({ version: "v3", auth: client });
}

/** Busy intervals for a given day (ISO date string), so the planner avoids them. */
export async function getBusy(dateISO) {
  if (!isConnected()) return [];
  const cal = calendarApi();
  const timeMin = new Date(`${dateISO}T00:00:00`).toISOString();
  const timeMax = new Date(`${dateISO}T23:59:59`).toISOString();
  const res = await cal.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      timeZone: config.timezone,
      items: [{ id: config.google.calendarId }],
    },
  });
  return res.data.calendars?.[config.google.calendarId]?.busy || [];
}

/** Insert the plan's time blocks as calendar events. Returns created event IDs. */
export async function bookBlocks(blocks) {
  const cal = calendarApi();
  const ids = [];
  for (const block of blocks) {
    const res = await cal.events.insert({
      calendarId: config.google.calendarId,
      requestBody: {
        summary: block.title,
        description: block.note || "",
        start: { dateTime: block.start, timeZone: config.timezone },
        end: { dateTime: block.end, timeZone: config.timezone },
      },
    });
    ids.push(res.data.id);
  }
  return ids;
}
