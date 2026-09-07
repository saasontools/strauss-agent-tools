// @ts-check
/** Runs the six families over one `ctx`, and renders what came back. */
import { buildContext } from "./context.mjs";
import * as familyA from "./family-a.mjs";
import * as familyB from "./family-b.mjs";
import * as familyC from "./family-c.mjs";
import * as familyD from "./family-d.mjs";
import * as familyE from "./family-e.mjs";
import * as familyF from "./family-f.mjs";
import { applyPolicy } from "./thresholds.mjs";
import { oneLine } from "./util.mjs";

const FAMILIES = [familyA, familyB, familyC, familyD, familyE, familyF];

const HEADINGS = {
  A: "Silence",
  B: "Coverage",
  C: "Fabrication",
  D: "Status",
  E: "Hygiene",
  F: "Holes given the work",
};

/** @param {import("./context.mjs").Ctx} ctx @returns {import("./util.mjs").Finding[]} */
export function runChecks(ctx) {
  const findings = FAMILIES.flatMap((family) => {
    try {
      return family.check(ctx);
    } catch {
      // One broken check must not swallow the other five.
      return [];
    }
  });
  return applyPolicy(findings, ctx.thresholds).sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

/**
 * @param {Parameters<typeof buildContext>[0]} options
 * @returns {{ base: string | null, head: string | null, stamp: string | null,
 *   classifier: string, findings: import("./util.mjs").Finding[] }}
 */
export function report(options) {
  const ctx = buildContext(options);
  return {
    base: ctx.base,
    head: ctx.head,
    stamp: ctx.stamp,
    classifier: ctx.classifier,
    findings: runChecks(ctx),
  };
}

/**
 * The one repair a late fixer may apply to another actor's record:
 * `anchor-resolve --rebaseline` on drift (D5). No op it is granted narrows an
 * anchor, clears an expiry or drops a link, so B1, E2 and E3 are not fixable.
 */
export const FIXABLE = new Set(["D5"]);

/** One finding as `--report` prints it: its kind as a label, and whether the
 * late fixer may apply it.
 * @param {import("./util.mjs").Finding} item */
export function label(item) {
  return { ...item, label: item.kind, fixable: FIXABLE.has(item.id) };
}

/** A finding's message carries record text, so what a hook writes is bounded. */
const MAX_MESSAGE_CHARS = 160;
const MAX_PER_FAMILY = 5;
const MAX_BLOCK_BYTES = 2048;

/**
 * Findings grouped by family, for a Stop hook's stderr. One sanitised line per
 * finding, a few per family, and a capped block: every message quotes records
 * nobody in this process wrote.
 * @param {import("./util.mjs").Finding[]} findings
 */
export function render(findings) {
  /** @type {Map<string, import("./util.mjs").Finding[]>} */
  const groups = new Map();
  for (const item of findings) {
    groups.set(item.family, [...(groups.get(item.family) ?? []), item]);
  }
  const lines = [];
  for (const family of [...groups.keys()].sort()) {
    const items = groups.get(family) ?? [];
    lines.push(
      `${oneLine(family, 1)}. ${HEADINGS[/** @type {keyof typeof HEADINGS} */ (family)] ?? family}`,
    );
    for (const item of items.slice(0, MAX_PER_FAMILY)) {
      lines.push(
        `  [${oneLine(item.id, 8)}] ${oneLine(item.message, MAX_MESSAGE_CHARS)}`,
      );
    }
    if (items.length > MAX_PER_FAMILY) {
      lines.push(`  +${items.length - MAX_PER_FAMILY} more`);
    }
  }
  return cap(lines);
}

/** @param {string[]} lines */
function cap(lines) {
  /** @type {string[]} */
  const kept = [];
  let bytes = 0;
  for (const line of lines) {
    bytes += Buffer.byteLength(line) + 1;
    if (bytes > MAX_BLOCK_BYTES) {
      kept.push(`… ${lines.length - kept.length} more line(s) not shown`);
      break;
    }
    kept.push(line);
  }
  return kept.join("\n");
}
