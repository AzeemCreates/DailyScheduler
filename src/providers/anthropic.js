import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

const client = new Anthropic();

export async function planWithAnthropic({ system, prompt, schema }) {
  const usingFable = config.model === "claude-fable-5";

  const response = await client.beta.messages.create({
    model: config.model,
    max_tokens: 8000,
    output_config: { format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content: prompt }],
    // Server-side fallback: if the primary model's safety classifiers decline
    // a request, the same call is transparently re-served by the fallback.
    ...(usingFable
      ? {
          betas: ["server-side-fallback-2026-06-01"],
          fallbacks: [{ model: config.fallbackModel }],
        }
      : {}),
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The planner declined this request. Try rephrasing your goals or message.");
  }

  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("Planner returned no content.");
  return text;
}
