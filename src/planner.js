import { config } from "./config.js";
import { planWithAnthropic } from "./providers/anthropic.js";
import { planWithOllama } from "./providers/ollama.js";

// Structured output schema for a plan: ranked to-dos + time blocks.
const PLAN_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description:
        "One or two sentences: the theme of the day and the single most important thing.",
    },
    todos: {
      type: "array",
      description: "The to-do list, ranked by what actually matters (rank 1 = most important).",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          rank: { type: "integer" },
          title: { type: "string" },
          reason: {
            type: "string",
            description: "Why this matters — which goal it moves forward and why it outranks the items below it.",
          },
          minutes: { type: "integer", description: "Realistic time needed." },
        },
        required: ["id", "rank", "title", "reason", "minutes"],
        additionalProperties: false,
      },
    },
    blocks: {
      type: "array",
      description: "Time blocks for the highest-ranked todos, scheduled into the free slots.",
      items: {
        type: "object",
        properties: {
          todoId: { type: "integer" },
          title: { type: "string" },
          start: { type: "string", format: "date-time" },
          end: { type: "string", format: "date-time" },
          note: { type: "string", description: "One-line note that goes into the calendar event description." },
        },
        required: ["todoId", "title", "start", "end", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "todos", "blocks"],
  additionalProperties: false,
};

const SYSTEM = `You are a ruthless but kind personal chief of staff. You look at the user's goals and produce:

1. A to-do list derived from the goals — concrete, finishable tasks, not vague intentions.
2. A ranking by what ACTUALLY matters: impact on the stated goals first, hard deadlines second, urgency-theater last. Be honest in each item's "reason" about why it beats the items below it. Busywork ranks at the bottom or gets dropped.
3. A time-blocked schedule for the planning day: place the top-ranked items into the free slots provided, deep work in the longest uninterrupted slots, small tasks batched together. Never overlap the busy times given. Leave short gaps between blocks where sensible. Do not schedule outside the working window.

All times you output must be ISO 8601 date-times with the correct UTC offset for the user's timezone. Only block what realistically fits — unblocked todos simply stay on the ranked list.

Respond with ONLY the JSON object matching the required schema — no other text.`;

/**
 * Generate a plan from goals + calendar availability.
 * Returns { summary, todos, blocks }.
 */
export async function generatePlan({ goals, busy, userMessage, planDate }) {
  const prompt = [
    `Timezone: ${config.timezone}`,
    `Now: ${new Date().toISOString()}`,
    `Planning day: ${planDate} (working window ${config.dayStart}–${config.dayEnd} local time)`,
    ``,
    `My goals:`,
    goals.length ? goals.map((g, i) => `${i + 1}. ${g}`).join("\n") : "(no goals saved yet — infer from my message)",
    ``,
    `Already-busy times on the planning day (do not overlap these):`,
    busy.length ? busy.map((b) => `- ${b.start} to ${b.end}`).join("\n") : "(calendar is clear)",
    ``,
    `My message: ${userMessage || "Plan my day."}`,
  ].join("\n");

  const text =
    config.provider === "ollama"
      ? await planWithOllama({ system: SYSTEM, prompt, schema: PLAN_SCHEMA })
      : await planWithAnthropic({ system: SYSTEM, prompt, schema: PLAN_SCHEMA });

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Planner returned non-JSON output: ${text.slice(0, 200)}`);
  }
}
