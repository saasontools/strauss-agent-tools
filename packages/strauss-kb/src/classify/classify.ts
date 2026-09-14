import { adjudicate } from "../adjudicate.js";
import type { KbRecord } from "../kb-record.schema.js";
import {
  placeOnHunk,
  symbolRangeIndex,
  type DiffHunk,
  type SymbolRangeIndex,
} from "../match-diff.js";
import {
  DEFAULT_THRESHOLDS,
  type KbClass,
  type KbClassifiedFile,
  type KbClassifyFile,
  type KbClassifyOptions,
  type KbClassifyThresholds,
  type KbVerdict,
} from "./model.js";
import {
  generatedMarker,
  isBoilerplateLine,
  HEADER_LINES,
  PATH_RULES,
} from "./rules.js";

/**
 * What kind of change each file carries.
 *
 * Every input is in the diff, so nothing here is written down: a class the KB
 * stored would be a second copy of an answer the patch already gives, and the
 * two would disagree the first time a rule changed. The one thing a script
 * cannot derive — "this output is generated, read its input instead" — is a
 * record, and it wins over the heuristic.
 */
export function classifyDiff(
  files: readonly KbClassifyFile[],
  options: KbClassifyOptions = {},
): KbClassifiedFile[] {
  const overrides = currentOverrides(options.records ?? [], options.now);
  const ranges = symbolRangeIndex(options.symbolRanges ?? []);
  const thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };
  return files.map((file) => classifyFile(file, overrides, ranges, thresholds));
}

/** A `review:*` fact and the class it asserts. */
type Override = { record: KbRecord; class: KbClass };

const OVERRIDE_CLASS = new Map<string, KbClass>([
  ["review:generated", "generated"],
  ["review:boilerplate", "boilerplate"],
  ["review:move", "rename"],
]);

/** Wide enough that a file-only anchor lands on it whatever the file's size. */
const WHOLE_FILE: DiffHunk = {
  startLine: 1,
  endLine: Number.MAX_SAFE_INTEGER,
};

function classifyFile(
  file: KbClassifyFile,
  overrides: readonly Override[],
  ranges: SymbolRangeIndex,
  thresholds: Required<KbClassifyThresholds>,
): KbClassifiedFile {
  // An anchor naming no symbol — or one nothing resolved — covers the file, so
  // its record settles every hunk and the heuristic never runs. Probed on the
  // new side only: an override written `side: "old"` is not read as one.
  const whole = overrides.find(
    ({ record }) =>
      placeOnHunk(record, file.filePath, WHOLE_FILE, ranges).kind === "file",
  );
  const verdict = whole ? verdictOf(whole) : heuristic(file, thresholds);

  const hunks = file.hunks.map((hunk) => {
    const hit =
      whole ??
      overrides.find(
        ({ record }) =>
          placeOnHunk(record, file.filePath, hunk, ranges).kind !== "miss",
      );
    return {
      startLine: hunk.startLine,
      endLine: hunk.endLine,
      ...(hit ? verdictOf(hit) : verdict),
    };
  });

  return {
    filePath: file.filePath,
    ...verdict,
    ...(file.renamedFrom ? { renamedFrom: file.renamedFrom } : {}),
    ...(hunks.some((hunk) => hunk.class !== verdict.class) ? { hunks } : {}),
  };
}

function verdictOf(override: Override): KbVerdict {
  return {
    class: override.class,
    reason: `kb-override ${override.record.conceptId}`,
  };
}

/** Precedence: a generator's banner, then the path table, then content. */
function heuristic(
  file: KbClassifyFile,
  thresholds: Required<KbClassifyThresholds>,
): KbVerdict {
  const marker = generatedMarker(file.header ?? headOfDiff(file));
  if (marker)
    return { class: "generated", reason: `generated-header ${marker}` };

  const rule = PATH_RULES.find((entry) => entry.test.test(file.filePath));
  if (rule) return { class: rule.class, reason: rule.name };

  if (
    file.renamedFrom &&
    !file.hunks.length &&
    (file.similarity ?? 100) >= thresholds.rename
  ) {
    return { class: "rename", reason: `rename ${file.renamedFrom}` };
  }

  const share = boilerplateShare(file);
  if (share !== undefined && share >= thresholds.boilerplate) {
    return {
      class: "boilerplate",
      reason: `boilerplate ${Math.round(share * 100)}%`,
    };
  }
  return { class: "source", reason: "default" };
}

/**
 * The head of the file as the diff shows it — every added line numbered inside
 * the banner window. All a caller that read no working tree can offer.
 *
 * The window is `--unified=0` numbering: a `--stdin` patch carrying context
 * lines numbers its hunk from the context, so a banner can be misattributed.
 */
function headOfDiff(file: KbClassifyFile): string[] {
  return file.hunks.flatMap((hunk) =>
    (hunk.side ?? "new") === "new" && hunk.startLine <= HEADER_LINES
      ? (hunk.lines ?? []).slice(0, HEADER_LINES - hunk.startLine + 1)
      : [],
  );
}

/** Undefined when no parser kept the lines: the rule cannot fire on nothing. */
function boilerplateShare(file: KbClassifyFile): number | undefined {
  const lines = file.hunks
    .flatMap((hunk) => hunk.lines ?? [])
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return undefined;
  return lines.filter(isBoilerplateLine).length / lines.length;
}

/**
 * The `review:*` facts that still hold, by concept id so two on one file
 * resolve the same way twice. Superseded and rejected ones are dropped: an
 * override is an assertion, and a withdrawn assertion is not one.
 */
function currentOverrides(records: KbRecord[], now?: Date): Override[] {
  const tagged = records.flatMap((record) => {
    if (record.frontmatter.type !== "fact") return [];
    const tag = (record.frontmatter.tags ?? []).find((entry) =>
      OVERRIDE_CLASS.has(entry),
    );
    const asserted = tag && OVERRIDE_CLASS.get(tag);
    return asserted ? [{ record, class: asserted }] : [];
  });

  const current = new Set(
    adjudicate(
      tagged.map(({ record }) => record),
      records,
      now,
    )
      .filter((entry) => entry.standing === "current")
      .map((entry) => entry.record.conceptId),
  );

  return tagged
    .filter(({ record }) => current.has(record.conceptId))
    .sort((left, right) =>
      left.record.conceptId.localeCompare(right.record.conceptId),
    );
}
