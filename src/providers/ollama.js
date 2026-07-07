import { config } from "../config.js";

/**
 * Local planner backend via Ollama's chat API (http://localhost:11434 by
 * default). Requires `ollama serve` running and the model pulled:
 *   ollama pull qwen3:8b
 *
 * Uses Ollama's structured-output support (`format: <json schema>`), so the
 * response content is guaranteed-parseable JSON matching our schema.
 */
export async function planWithOllama({ system, prompt, schema }) {
  const url = `${config.ollama.baseUrl.replace(/\/$/, "")}/api/chat`;

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.ollama.model,
        stream: false,
        // Qwen3 and other reasoning models: skip the <think> pass so the
        // response is just the structured JSON.
        think: false,
        format: schema,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        options: { temperature: 0.2 },
      }),
    });
  } catch (err) {
    throw new Error(
      `Couldn't reach Ollama at ${config.ollama.baseUrl}. Is "ollama serve" running? (${err.message})`
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Ollama request failed (${res.status}): ${body || res.statusText}`);
  }

  const data = await res.json();
  const text = data?.message?.content;
  if (!text) throw new Error("Ollama returned no content. Is the model pulled? Try: ollama pull " + config.ollama.model);
  return text;
}
