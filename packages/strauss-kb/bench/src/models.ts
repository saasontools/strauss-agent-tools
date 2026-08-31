/**
 * The two tiers the benchmark runs, and what they cost.
 *
 * Two tiers rather than one because the interesting failure -- acting on a
 * decision that was reversed -- is the kind a smaller model makes more often,
 * and an intervention that only helps the cheap tier is still worth knowing
 * about. Prices are USD per million tokens, first-party Claude API rates.
 */
export type BenchModel = {
  id: string;
  label: string;
  inputPerMTok: number;
  outputPerMTok: number;
};

export const MODELS: readonly BenchModel[] = [
  {
    id: "claude-sonnet-5",
    label: "Sonnet 5",
    inputPerMTok: 2,
    outputPerMTok: 10,
  },
  {
    id: "claude-haiku-4-5",
    label: "Haiku 4.5",
    inputPerMTok: 1,
    outputPerMTok: 5,
  },
];

export const DEFAULT_MODEL_IDS = MODELS.map((model) => model.id);

export function findModel(id: string): BenchModel | undefined {
  return MODELS.find((model) => model.id === id);
}

/** Dollars, given a call count and per-call token estimates. */
export function estimateCost(
  modelId: string,
  calls: number,
  inputTokensPerCall: number,
  outputTokensPerCall: number,
): number {
  const model = findModel(modelId);
  if (!model) return Number.NaN;
  return (
    (calls * inputTokensPerCall * model.inputPerMTok) / 1e6 +
    (calls * outputTokensPerCall * model.outputPerMTok) / 1e6
  );
}
