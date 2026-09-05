// @ts-check
/** Gate thresholds, read from `gate` in `.strauss/kb-pins.json`. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Ids that ship as warnings, whatever their family says. */
export const WARN_BY_DEFAULT = [
  "A4",
  "B2",
  "B4",
  "C2",
  "C5",
  "C7",
  "C8",
  "C9",
  "D4",
  "E2",
  "F2",
  "F9",
];

export const DEFAULTS = {
  /** A2: shortest honest `decision.none` reason. */
  reasonWords: 12,
  /** A4: records written this close to Stop, with bodies this short. */
  hurriedSeconds: 60,
  hurriedWords: 40,
  /** B4: one record spread this wide. */
  maxSymbols: 6,
  maxFiles: 3,
  /** C2: body token overlap with the added lines. */
  maxAddedOverlap: 0.6,
  /** C7: two records this alike. */
  maxSimilarity: 0.8,
  /** C8: how many records before "all non-blocking" means anything. */
  uniformMinRecords: 3,
  /** F2: a file or function big enough to owe an explanation. */
  newFileLines: 150,
  functionLines: 60,
  /** F12: changed lines under one symbol that a `fact` cannot carry alone. */
  factOnlyLines: 30,
  /** Blocks demoted to warnings, by id. */
  warn: /** @type {string[]} */ ([]),
  /** Checks switched off entirely, by id. */
  off: /** @type {string[]} */ ([]),
};

/** @typedef {typeof DEFAULTS} Thresholds */

/** @param {string} repoRoot @returns {Record<string, unknown> | null} */
export function gateConfig(repoRoot) {
  try {
    const pins = JSON.parse(
      readFileSync(join(repoRoot, ".strauss", "kb-pins.json"), "utf8"),
    );
    return pins?.gate && typeof pins.gate === "object" ? pins.gate : null;
  } catch {
    // No manifest, or an unreadable one: the defaults are the policy.
    return null;
  }
}

/** @param {string} repoRoot @returns {Thresholds} */
export function readThresholds(repoRoot) {
  const gate = gateConfig(repoRoot) ?? {};
  const merged = { ...DEFAULTS, ...gate };
  merged.warn = [
    ...WARN_BY_DEFAULT,
    ...(Array.isArray(gate.warn) ? gate.warn : []),
  ];
  merged.off = Array.isArray(gate.off) ? gate.off : [];
  return merged;
}

/**
 * Applies the demotion list, then drops what is switched off.
 * @param {import("./util.mjs").Finding[]} findings @param {Thresholds} thresholds
 */
export function applyPolicy(findings, thresholds) {
  return findings
    .filter((item) => !thresholds.off.includes(item.id))
    .map((item) =>
      thresholds.warn.includes(item.id) && item.severity === "block"
        ? { ...item, severity: /** @type {"warn"} */ ("warn") }
        : item,
    );
}
