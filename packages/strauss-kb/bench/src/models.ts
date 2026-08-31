import type { CellUsage } from "./model.js";

/**
 * The two tiers the benchmark runs, and what they cost.
 *
 * Two tiers rather than one because the interesting failure -- acting on a
 * decision that was reversed -- is the kind a smaller model makes more often,
 * and an intervention that only helps the cheap tier is still worth knowing
 * about. Prices are USD per million tokens, first-party Claude API rates.
 *
 * `minCacheableTokens` is the model's minimum cacheable prefix: below it a
 * `cache_control` marker is silently ignored -- no error, just
 * `cache_creation_input_tokens: 0`. It is not monotonic across generations,
 * which is why it is a per-model field rather than one constant: Sonnet 5
 * caches from 1024 tokens, Haiku 4.5 needs 4096.
 */
export type BenchModel = {
  id: string;
  label: string;
  inputPerMTok: number;
  outputPerMTok: number;
  minCacheableTokens: number;
};

/** Cache writes bill at 1.25x the base input rate on the default 5-minute TTL. */
export const CACHE_WRITE_MULTIPLIER = 1.25;
/** Cache reads bill at ~0.1x the base input rate. */
export const CACHE_READ_MULTIPLIER = 0.1;

export const MODELS: readonly BenchModel[] = [
  {
    id: "claude-sonnet-5",
    label: "Sonnet 5",
    inputPerMTok: 2,
    outputPerMTok: 10,
    minCacheableTokens: 1024,
  },
  {
    id: "claude-haiku-4-5",
    label: "Haiku 4.5",
    inputPerMTok: 1,
    outputPerMTok: 5,
    minCacheableTokens: 4096,
  },
];

export const DEFAULT_MODEL_IDS = MODELS.map((model) => model.id);

export function findModel(id: string): BenchModel | undefined {
  return MODELS.find((model) => model.id === id);
}

/** Dollars for one call's measured usage, each token class at its own rate. */
export function usageCost(modelId: string, usage: CellUsage): number {
  const model = findModel(modelId);
  if (!model) return Number.NaN;
  const input =
    usage.inputTokens +
    usage.cacheWriteTokens * CACHE_WRITE_MULTIPLIER +
    usage.cacheReadTokens * CACHE_READ_MULTIPLIER;
  return (
    (input * model.inputPerMTok) / 1e6 +
    (usage.outputTokens * model.outputPerMTok) / 1e6
  );
}

export type CellEstimate = {
  /** Constant within an arm: written once, then read back. */
  prefixTokens: number;
  /** Question plus answer instructions -- uncached on every call. */
  tailTokens: number;
  outputTokens: number;
  /** Questions asked against one arm's prefix. */
  callsPerPrefix: number;
  /** Distinct prefixes -- one per arm. */
  prefixes: number;
};

export type CostProjection = {
  calls: number;
  /** What the run costs if the prefix caches as intended. */
  cached: number;
  /** What it costs if the cache never hits. The honest upper bound. */
  uncached: number;
  /** False when the prefix is under this model's minimum cacheable size. */
  prefixCaches: boolean;
};

/**
 * Prices a run both ways.
 *
 * Both, deliberately. A single "with caching" figure would be a forecast
 * dressed as a budget: an entry can expire between arms, a retry can land on a
 * cold cache, and a prefix under the model's minimum silently never caches at
 * all. The uncached column is what the run cannot exceed.
 */
export function projectCost(
  modelId: string,
  estimate: CellEstimate,
): CostProjection {
  const model = findModel(modelId);
  const calls = estimate.prefixes * estimate.callsPerPrefix;
  if (!model) {
    return {
      calls,
      cached: Number.NaN,
      uncached: Number.NaN,
      prefixCaches: false,
    };
  }

  const rate = model.inputPerMTok / 1e6;
  const outRate = model.outputPerMTok / 1e6;
  const prefixCaches = estimate.prefixTokens >= model.minCacheableTokens;

  const tail = calls * estimate.tailTokens * rate;
  const output = calls * estimate.outputTokens * outRate;
  const uncachedPrefix = calls * estimate.prefixTokens * rate;

  const cachedPrefix = prefixCaches
    ? estimate.prefixes *
      estimate.prefixTokens *
      rate *
      (CACHE_WRITE_MULTIPLIER +
        (estimate.callsPerPrefix - 1) * CACHE_READ_MULTIPLIER)
    : uncachedPrefix;

  return {
    calls,
    cached: cachedPrefix + tail + output,
    uncached: uncachedPrefix + tail + output,
    prefixCaches,
  };
}
