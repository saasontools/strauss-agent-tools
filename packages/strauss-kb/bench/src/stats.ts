import type { ConfidenceInterval } from "./model.js";

/**
 * A seeded PRNG, so a reported interval is reproducible from the result file.
 *
 * mulberry32: 32 bits of state, one multiply-xor round. Nothing here needs
 * cryptographic quality -- it needs to give the same sequence on every machine
 * that reads the same seed, which `Math.random` cannot.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type BootstrapOptions = {
  iterations?: number;
  /** Two-sided; 0.05 gives a 95% interval. */
  alpha?: number;
  seed?: number;
};

/**
 * Percentile bootstrap over per-question 0/1 outcomes.
 *
 * Written out rather than imported: an accuracy over thirty questions is not
 * normal near the ends of its range, so the normal-approximation interval a
 * one-liner would give is wrong exactly where an arm is most interesting.
 */
export function bootstrapCi(
  outcomes: readonly number[],
  options: BootstrapOptions = {},
): ConfidenceInterval {
  const { iterations = 10_000, alpha = 0.05, seed = 20260901 } = options;
  const n = outcomes.length;
  if (n === 0)
    return { mean: Number.NaN, lower: Number.NaN, upper: Number.NaN };

  const mean = outcomes.reduce((sum, value) => sum + value, 0) / n;
  if (n === 1) return { mean, lower: mean, upper: mean };

  const random = mulberry32(seed);
  const means = new Float64Array(iterations);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let total = 0;
    for (let draw = 0; draw < n; draw += 1) {
      total += outcomes[Math.floor(random() * n)] ?? 0;
    }
    means[iteration] = total / n;
  }
  means.sort();

  return {
    mean,
    lower: percentile(means, alpha / 2),
    upper: percentile(means, 1 - alpha / 2),
  };
}

/** Nearest-rank percentile over an already-sorted array. */
function percentile(sorted: Float64Array, quantile: number): number {
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(quantile * sorted.length) - 1),
  );
  return sorted[index] ?? Number.NaN;
}
