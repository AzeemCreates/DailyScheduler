import { config } from "./config.js";
import { generatePlan } from "./planner.js";
import * as cal from "./calendar.js";
import {
  getGoals,
  addGoal,
  removeGoal,
  setPendingPlan,
  getPendingPlan,
  clearPendingPlan,
  logBooking,
} from "./store.js";

const HELP = [
  "Commands:",
  '- "plan my day" (or any planning request) — I read your goals, write a ranked to-do list, and block it into your day',
  '- "book it!" — push the proposed blocks straight into Google Calendar',
  '- "add goal <text>" — save a goal',
  '- "goals" — list saved goals',
  '- "remove goal <n>" — delete a goal',
  '- "help" — this message',
].join("\n");

function localTime(iso) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: config.timezone,
  });
}

function renderPlan(plan, { compact = false } = {}) {
  const lines = [plan.summary, ""];
  lines.push("Ranked to-dos:");
  for (const t of [...plan.todos].sort((a, b) => a.rank - b.rank)) {
    lines.push(`${t.rank}. ${t.title} (~${t.minutes}m)`);
    if (!compact) lines.push(`   ${t.reason}`);
  }
  lines.push("", "Proposed blocks:");
  for (const b of plan.blocks) {
    lines.push(`- ${localTime(b.start)}–${localTime(b.end)}  ${b.title}`);
  }
  lines.push("", 'Reply "book it!" to put these straight into your Google Calendar.');
  return lines.join("\n");
}

function todayISO() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now); // YYYY-MM-DD
}

/**
 * Handle one inbound message from any channel (web, CLI, SMS, Shortcut).
 * Returns the reply text.
 */
export async function handleMessage(userId, text, { compact = false } = {}) {
  const t = (text || "").trim();
  const lower = t.toLowerCase();

  if (!t || lower === "help") return HELP;

  if (lower === "goals" || lower === "list goals") {
    const goals = getGoals();
    return goals.length
      ? "Your goals:\n" + goals.map((g, i) => `${i + 1}. ${g}`).join("\n")
      : 'No goals saved yet. Use "add goal <text>".';
  }

  if (lower.startsWith("add goal")) {
    const goal = t.slice("add goal".length).replace(/^[:\s]+/, "");
    if (!goal) return 'Usage: add goal <text>';
    addGoal(goal);
    return `Saved. You now have ${getGoals().length} goal(s).`;
  }

  if (lower.startsWith("remove goal")) {
    const n = parseInt(t.slice("remove goal".length), 10);
    const removed = Number.isInteger(n) ? removeGoal(n - 1) : null;
    return removed ? `Removed: ${removed}` : "Usage: remove goal <number> (see \"goals\")";
  }

  if (/^book( it)?!?$/.test(lower) || lower === "yes book it" || lower === "book it!") {
    const plan = getPendingPlan(userId);
    if (!plan) return 'Nothing to book yet — ask me to "plan my day" first.';
    if (!cal.isConnected()) {
      return "Google Calendar isn't connected yet. Open /auth/google on the server in a browser, then try again.";
    }
    const ids = await cal.bookBlocks(plan.blocks);
    logBooking(userId, plan, ids);
    clearPendingPlan(userId);
    return `Booked ${ids.length} block(s) into your calendar. Go get it.`;
  }

  // Anything else is treated as a planning request (with the message as context).
  const planDate = todayISO();
  const busy = cal.isConnected() ? await cal.getBusy(planDate) : [];
  const plan = await generatePlan({
    goals: getGoals(),
    busy,
    userMessage: t,
    planDate,
  });
  setPendingPlan(userId, plan);
  return renderPlan(plan, { compact });
}
