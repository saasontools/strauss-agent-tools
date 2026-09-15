// @ts-check
/**
 * Gate policy, read from `gate` in `.strauss/kb-pins.json`: which blocks are
 * demoted to warnings and which checks are off, by finding id. Every check is
 * a fact of the store or the diff; there is no threshold to tune.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Ids that ship as warnings: a hint, not a verdict. */
export const WARN_BY_DEFAULT = [
  "anchor.outside-diff",
  "claim.dead-source",
  "claim.self-verified",
  "standing.supersede-chain",
  "store.expired",
];

export const DEFAULTS = {
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
  return {
    warn: [
      ...WARN_BY_DEFAULT,
      ...(Array.isArray(gate.warn) ? gate.warn.map(String) : []),
    ],
    off: Array.isArray(gate.off) ? gate.off.map(String) : [],
  };
}

/**
 * Applies the demotion list, then drops what is switched off. A group name
 * (`owed`) demotes or silences every id under it.
 * @param {import("./util.mjs").Finding[]} findings @param {Thresholds} thresholds
 */
export function applyPolicy(findings, thresholds) {
  const named = (/** @type {string[]} */ list, /** @type {import("./util.mjs").Finding} */ item) =>
    list.includes(item.id) || list.includes(item.group);
  return findings
    .filter((item) => !named(thresholds.off, item))
    .map((item) =>
      named(thresholds.warn, item) && item.severity === "block"
        ? { ...item, severity: /** @type {"warn"} */ ("warn") }
        : item,
    );
}
