// @ts-check
/** Runs the six check groups over one `ctx`, and renders what came back. */
import { buildContext } from "./context.mjs";
import * as anchor from "./checks/anchor.mjs";
import * as claim from "./checks/claim.mjs";
import * as owed from "./checks/owed.mjs";
import * as standing from "./checks/standing.mjs";
import * as store from "./checks/store.mjs";
import * as uncovered from "./checks/uncovered.mjs";
import { applyPolicy } from "./thresholds.mjs";
import { oneLine } from "./util.mjs";

const GROUPS = [uncovered, anchor, claim, standing, store, owed];

/** What a finding in each group says about the change. */
export const HEADINGS = {
  uncovered: "a change no record covers",
  anchor: "the record does not point at this change",
  claim: "the record asserts what the code does not show",
  standing: "status moved without the work",
  store: "the base itself is broken",
  owed: "the diff carries a signal that owes a record",
};

/** @param {import("./context.mjs").Ctx} ctx @returns {import("./util.mjs").Finding[]} */
export function runChecks(ctx) {
  const findings = GROUPS.flatMap((group) => {
    try {
      return group.check(ctx);
    } catch {
      // One broken check must not swallow the other five groups.
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
 * `anchor-resolve --rebaseline` on `anchor.drifted`. No op it is granted narrows
 * an anchor, clears an expiry or drops a link, so `anchor.file-only`,
 * `store.expired` and `store.dangling-link` are not fixable.
 */
export const FIXABLE = new Set(["anchor.drifted"]);

/** One finding as `--report` prints it: its kind as a label, and whether the
 * late fixer may apply it.
 * @param {import("./util.mjs").Finding} item */
export function label(item) {
  return { ...item, label: item.kind, fixable: FIXABLE.has(item.id) };
}

/** A finding's message carries record text, so what a hook writes is bounded. */
const MAX_MESSAGE_CHARS = 160;
const MAX_PER_GROUP = 5;
const MAX_BLOCK_BYTES = 2048;

/**
 * Findings grouped for a Stop hook's stderr. One sanitised line per finding,
 * a few per group, and a capped block: every message quotes records nobody in
 * this process wrote.
 * @param {import("./util.mjs").Finding[]} findings
 */
export function render(findings) {
  /** @type {Map<string, import("./util.mjs").Finding[]>} */
  const groups = new Map();
  for (const item of findings) {
    groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  }
  const lines = [];
  for (const group of Object.keys(HEADINGS).filter((name) => groups.has(name))) {
    const items = groups.get(group) ?? [];
    lines.push(
      `${oneLine(group, 12)}: ${HEADINGS[/** @type {keyof typeof HEADINGS} */ (group)]}`,
    );
    for (const item of items.slice(0, MAX_PER_GROUP)) {
      lines.push(
        `  [${oneLine(item.id, 32)}] ${oneLine(item.message, MAX_MESSAGE_CHARS)}`,
      );
    }
    if (items.length > MAX_PER_GROUP) {
      lines.push(`  +${items.length - MAX_PER_GROUP} more`);
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
