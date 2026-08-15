import type { ContentPartLike, InteractionLike, UrlCitation } from "./types.js";

/** Latest thought summary — the progress signal while a run is in flight.
 * Only populated when the run was started with thinking_summaries: "auto". */
export function latestThought(
  interaction: InteractionLike,
): string | undefined {
  const thoughts = (interaction.steps ?? []).filter(
    (step) => step.type === "thought",
  );
  const last = thoughts[thoughts.length - 1];
  if (!last?.summary) return undefined;
  const text = last.summary
    .filter((part) => typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
  return text || undefined;
}

function partsText(parts: ContentPartLike[] | undefined): string {
  return (parts ?? [])
    .filter((part) => typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

/** Final report text. Prefers the SDK-computed output_text; falls back to
 * concatenating the model_output steps if it is ever absent. */
export function reportText(interaction: InteractionLike): string | undefined {
  if (interaction.output_text && interaction.output_text.trim()) {
    return interaction.output_text;
  }
  const outputs = (interaction.steps ?? [])
    .filter((step) => step.type === "model_output")
    .map((step) => partsText(step.content))
    .filter((text) => text.trim());
  const joined = outputs.join("\n");
  return joined.trim() ? joined : undefined;
}

/** URL citations from all model output, deduplicated by URL. Other annotation
 * variants (file/place/word) are tolerated and skipped. */
export function urlCitations(interaction: InteractionLike): UrlCitation[] {
  const seen = new Map<string, UrlCitation>();
  for (const step of interaction.steps ?? []) {
    if (step.type !== "model_output") continue;
    for (const part of step.content ?? []) {
      for (const annotation of part.annotations ?? []) {
        if (annotation.type === "url_citation" && annotation.url) {
          if (!seen.has(annotation.url)) {
            seen.set(annotation.url, {
              url: annotation.url,
              ...(annotation.title ? { title: annotation.title } : {}),
            });
          }
        }
      }
    }
  }
  return [...seen.values()];
}

/** Human-readable usage line — the only real cost signal the user gets. */
export function usageSummary(interaction: InteractionLike): string | undefined {
  const usage = interaction.usage;
  if (!usage) return undefined;
  const groundingCalls = (usage.grounding_tool_count ?? []).length;
  const parts = [
    `input tokens: ${usage.total_input_tokens ?? 0}`,
    `output tokens: ${usage.total_output_tokens ?? 0}`,
    `thought tokens: ${usage.total_thought_tokens ?? 0}`,
  ];
  if (usage.total_cached_tokens) {
    parts.push(`cached tokens: ${usage.total_cached_tokens}`);
  }
  if (groundingCalls > 0) {
    parts.push(`grounding tool types used: ${groundingCalls}`);
  }
  return parts.join(", ");
}

/** Compact failure summary from the interaction's errors array. */
export function errorSummary(interaction: InteractionLike): string | undefined {
  const errors = (interaction.errors ?? [])
    .map((err) => [err.code, err.message].filter(Boolean).join(": ").trim())
    .filter(Boolean);
  return errors.length ? errors.join("; ") : undefined;
}
