import { config } from "./config.js";
import { generatePlan } from "./planner.js";
import { parseQuickEvent } from "./quickEvent.js";
import * as cal from "./calendar.js";
import {
  getGoals,
  addGoal,
  removeGoal,
  setPendingPlan,
  getPendingPlan,
  clearPendingPlan,
  logBooking,
  logHistoryEntry,
  getHistory,
} from "./store.js";

const HELP = [
  "Commands:",
  '- "plan my day" (or any planning request) — I read your goals, write a ranked to-do list, and block it into your day',
  '- "book it!" — push the proposed blocks straight into Google Calendar',
  '- "add goal <text>" — save a goal',
  '- "goals" — list saved goals',
  '- "remove goal <n>" — delete a goal',
  '- "Title: <text>" + "Time: <time>" — schedule that exact event directly, no AI guessing (e.g. "Title: Team sync\\nTime: 9:00 PM - 9:45 PM")',
  '- "history" (or "history <n>") — see your last messages, in case you forgot what you said',
  '- "help" — this message',
].join("\n");

function localTime(iso) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: config.timezone,
  });
}

function localDateTime(iso) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
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

function renderHistory(entries) {
  if (!entries.length) return "No history yet.";
  const lines = ["Your recent messages (most recent first):", ""];
  for (const e of entries) {
    const output = e.output.length > 160 ? e.output.slice(0, 160) + "…" : e.output;
    lines.push(`[${localDateTime(e.at)}] you: ${e.input}`);
    lines.push(`  → ${output.replace(/\n/g, " ")}`);
    lines.push("");
  }
  return lines.join("\n").trim();
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

/** Core command handling. Returns { reply, type, log } — log=false skips history logging. */
async function respond(userId, t, lower, { compact }) {
  if (!t || lower === "help") return { reply: HELP, type: "command", log: false };

  if (lower === "history" || lower.startsWith("history ")) {
    const arg = lower.replace(/^history\s*/, "").trim();
    const limit = /^\d+$/.test(arg) ? parseInt(arg, 10) : 10;
    return { reply: renderHistory(getHistory(userId, { limit })), type: "command", log: false };
  }

  if (lower === "goals" || lower === "list goals") {
    const goals = getGoals();
    const reply = goals.length
      ? "Your goals:\n" + goals.map((g, i) => `${i + 1}. ${g}`).join("\n")
      : 'No goals saved yet. Use "add goal <text>".';
    return { reply, type: "command" };
  }

  if (lower.startsWith("add goal")) {
    const goal = t.slice("add goal".length).replace(/^[:\s]+/, "");
    if (!goal) return { reply: "Usage: add goal <text>", type: "command", log: false };
    addGoal(goal);
    return { reply: `Saved. You now have ${getGoals().length} goal(s).`, type: "command" };
  }

  if (lower.startsWith("remove goal")) {
    const n = parseInt(t.slice("remove goal".length), 10);
    const removed = Number.isInteger(n) ? removeGoal(n - 1) : null;
    const reply = removed ? `Removed: ${removed}` : 'Usage: remove goal <number> (see "goals")';
    return { reply, type: "command" };
  }

  if (/^book( it)?!?$/.test(lower) || lower === "yes book it" || lower === "book it!") {
    const plan = getPendingPlan(userId);
    if (!plan) return { reply: 'Nothing to book yet — ask me to "plan my day" first.', type: "command" };
    if (!cal.isConnected()) {
      return {
        reply: "Google Calendar isn't connected yet. Open /auth/google on the server in a browser, then try again.",
        type: "command",
      };
    }
    const ids = await cal.bookBlocks(plan.blocks);
    logBooking(userId, plan, ids);
    clearPendingPlan(userId);
    return { reply: `Booked ${ids.length} block(s) into your calendar. Go get it.`, type: "command" };
  }

  if (lower.includes("title:") && lower.includes("time:")) {
    const planDate = todayISO();
    const quick = parseQuickEvent(t, { planDateISO: planDate });
    if (!quick) {
      return {
        reply:
          'Couldn\'t read that time. Try:\nTitle: <event name>\nTime: <e.g. 9:00 PM - 9:45 PM, or just 9pm>',
        type: "command",
      };
    }
    const minutes = Math.round((quick.end - quick.start) / 60000);
    const plan = {
      summary: `Scheduled: ${quick.title}`,
      todos: [{ id: 1, rank: 1, title: quick.title, reason: "Directly scheduled by you.", minutes }],
      blocks: [
        { todoId: 1, title: quick.title, start: quick.start.toISOString(), end: quick.end.toISOString(), note: "" },
      ],
    };
    setPendingPlan(userId, plan);
    return { reply: renderPlan(plan, { compact }), type: "planning" };
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
  return { reply: renderPlan(plan, { compact }), type: "planning" };
}

/**
 * Handle one inbound message from any channel (web, CLI, SMS, Shortcut).
 * Every message and its reply is persisted to data/history.json (per userId)
 * so nothing is lost, even between restarts or across devices.
 * Returns the reply text.
 */
export async function handleMessage(userId, text, { compact = false } = {}) {
  const t = (text || "").trim();
  const lower = t.toLowerCase();

  const { reply, type, log = true } = await respond(userId, t, lower, { compact });

  if (log) {
    logHistoryEntry(userId, { type, input: t, output: reply });
  }

  return reply;
}
