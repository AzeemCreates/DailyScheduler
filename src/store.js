import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

// Simple local JSON storage — everything lives on disk in data/.

function fileFor(key) {
  return path.join(config.dataDir, `${key}.json`);
}

export function read(key, fallback) {
  try {
    return JSON.parse(fs.readFileSync(fileFor(key), "utf8"));
  } catch {
    return fallback;
  }
}

export function write(key, value) {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(fileFor(key), JSON.stringify(value, null, 2));
}

// --- Goals -----------------------------------------------------------------

export function getGoals() {
  return read("goals", []);
}

export function addGoal(text) {
  const goals = getGoals();
  goals.push(text);
  write("goals", goals);
  return goals;
}

export function removeGoal(index) {
  const goals = getGoals();
  if (index < 0 || index >= goals.length) return null;
  const [removed] = goals.splice(index, 1);
  write("goals", goals);
  return removed;
}

// --- Pending plans (one per user/channel, awaiting "book it!") -------------

export function setPendingPlan(userId, plan) {
  const pending = read("pending", {});
  pending[userId] = plan;
  write("pending", pending);
}

export function getPendingPlan(userId) {
  return read("pending", {})[userId] || null;
}

export function clearPendingPlan(userId) {
  const pending = read("pending", {});
  delete pending[userId];
  write("pending", pending);
}

// --- Booking history --------------------------------------------------------

export function logBooking(userId, plan, eventIds) {
  const history = read("bookings", []);
  history.push({
    userId,
    bookedAt: new Date().toISOString(),
    summary: plan.summary,
    blocks: plan.blocks,
    eventIds,
  });
  write("bookings", history);
}

// --- Conversation history (every message + reply, so nothing gets lost) ----

const MAX_HISTORY = 500; // total entries kept across all users; oldest trimmed first

export function logHistoryEntry(userId, { type, input, output }) {
  const history = read("history", []);
  history.push({
    userId,
    type, // "planning" | "command"
    input,
    output,
    at: new Date().toISOString(),
  });
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  write("history", history);
}

/** Most recent entries for a user, newest first. Pass type to filter (e.g. "planning"). */
export function getHistory(userId, { limit = 20, type = null } = {}) {
  const history = read("history", []);
  return history
    .filter((h) => h.userId === userId && (!type || h.type === type))
    .slice(-limit)
    .reverse();
}
