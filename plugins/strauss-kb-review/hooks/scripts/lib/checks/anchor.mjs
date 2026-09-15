// @ts-check
/** anchor — the record does not point at this change. */
import { SKIPPED } from "../classify.mjs";
import { asString, finding, isCodePath } from "../util.mjs";

export const GROUP = "anchor";

const DECLARATION =
  /^\s*(export\s+)?(default\s+)?(abstract\s+)?(class|interface|enum|function|type|const\s+\w+\s*=\s*(async\s*)?\()|^\s*(public|private|protected|static|async|readonly)?\s*[A-Za-z_$][\w$]*\s*\(/m;

/** @param {import("../context.mjs").Ctx} ctx */
export function check(ctx) {
  return [
    ...fileOnly(ctx),
    ...outsideDiff(ctx),
    ...missingSymbol(ctx),
    ...drifted(ctx),
  ];
}

/** anchor.file-only — a file-only anchor on a code file that has symbols to name.
 * @param {import("../context.mjs").Ctx} ctx */
function* fileOnly(ctx) {
  for (const record of ctx.touched) {
    for (const anchor of record.anchors) {
      if (anchor.symbol) continue;
      if (!isCodePath(anchor.file)) continue;
      if (SKIPPED.has(ctx.classes.get(anchor.file) ?? "")) continue;
      if (!DECLARATION.test(ctx.fileAtHead(anchor.file))) continue;
      yield finding(
        "anchor.file-only",
        GROUP,
        "block",
        "mechanical",
        `${record.conceptId} anchors ${anchor.file} whole; the file declares symbols to anchor instead.`,
        { recordId: record.conceptId, file: anchor.file },
      );
    }
  }
}

/** anchor.outside-diff — the anchor points somewhere the diff did not go.
 * @param {import("../context.mjs").Ctx} ctx */
function* outsideDiff(ctx) {
  const changed = new Set(
    ctx.changedSymbols
      .filter((entry) => entry.symbol)
      .map((entry) => `${entry.file}\u0000${entry.symbol}`),
  );
  for (const record of ctx.touched) {
    for (const anchor of record.anchors) {
      if (!anchor.symbol || !ctx.changedPaths.has(anchor.file)) continue;
      const leaf = anchor.symbol.split(".").pop() ?? anchor.symbol;
      if (changed.has(`${anchor.file}\u0000${leaf}`)) continue;
      yield finding(
        "anchor.outside-diff",
        GROUP,
        "warn",
        "mechanical",
        `${record.conceptId} anchors ${anchor.symbol}, which this diff does not change; callers and callees were not consulted, so a call into the change is not seen.`,
        {
          recordId: record.conceptId,
          file: anchor.file,
          symbol: anchor.symbol,
        },
      );
    }
  }
}

/** anchor.missing-symbol — the anchor names a symbol that is not there.
 * @param {import("../context.mjs").Ctx} ctx */
function* missingSymbol(ctx) {
  for (const [conceptId, result] of ctx.anchorState) {
    for (const anchor of result?.results ?? []) {
      if (asString(anchor?.reason) !== "symbol-not-found") continue;
      yield finding(
        "anchor.missing-symbol",
        GROUP,
        "block",
        "mechanical",
        `${conceptId} anchors ${anchor.file}:${anchor.symbol}, which no longer exists.`,
        {
          recordId: conceptId,
          file: asString(anchor.file),
          symbol: asString(anchor.symbol),
        },
      );
    }
  }
}

/** anchor.drifted — the code moved under an anchor and the record still claims it.
 * @param {import("../context.mjs").Ctx} ctx */
function* drifted(ctx) {
  for (const [conceptId, result] of ctx.anchorState) {
    for (const anchor of result?.results ?? []) {
      if (asString(anchor?.state) !== "drifted") continue;
      yield finding(
        "anchor.drifted",
        GROUP,
        "block",
        "mechanical",
        `${conceptId} drifted on ${anchor.file}:${anchor.symbol} — reassess it, then rebaseline.`,
        {
          recordId: conceptId,
          file: asString(anchor.file),
          symbol: asString(anchor.symbol),
        },
      );
    }
  }
}
