import {
  classifyDiff as classifyDeclared,
  type Declared,
  type DiffHunk,
  type SymbolRange,
} from "@saasontools/code-diff";
import { adjudicate } from "../adjudicate.js";
import type { KbRecord } from "../kb-record.schema.js";
import { placeOnHunk, symbolRangeIndex } from "../match-diff.js";
import type {
  KbClass,
  KbClassifiedFile,
  KbClassifyFile,
  KbClassifyOptions,
  KbVerdict,
} from "./model.js";

/**
 * What kind of change each file carries: a current `review:*` fact anchored on
 * it first, then what the repository declares, through code-diff's classifier.
 */
export function classifyDiff(
  files: readonly KbClassifyFile[],
  options: KbClassifyOptions = {},
): KbClassifiedFile[] {
  return classifyDeclared(files, {
    declared: kbDeclared(
      options.records ?? [],
      options.symbolRanges ?? [],
      options.now,
    ),
    ...(options.attributes ? { attributes: options.attributes } : {}),
    ...(options.repoDeclares !== undefined
      ? { repoDeclares: options.repoDeclares }
      : {}),
  });
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

/**
 * The current `review:*` facts as code-diff's declaration lookup. An anchor
 * naming no symbol — or one nothing resolved — covers the file. Probed on the
 * new side only: an override written `side: "old"` is not read as one.
 */
export function kbDeclared(
  records: KbRecord[],
  symbolRanges: readonly SymbolRange[],
  now?: Date,
): Declared {
  const overrides = currentOverrides(records, now);
  const ranges = symbolRangeIndex(symbolRanges);
  return {
    file: (filePath) => {
      const hit = overrides.find(
        ({ record }) =>
          placeOnHunk(record, filePath, WHOLE_FILE, ranges).kind === "file",
      );
      return hit && verdictOf(hit);
    },
    hunk: (filePath, hunk) => {
      const hit = overrides.find(
        ({ record }) =>
          placeOnHunk(record, filePath, hunk, ranges).kind !== "miss",
      );
      return hit && verdictOf(hit);
    },
  };
}

function verdictOf(override: Override): KbVerdict {
  return {
    class: override.class,
    reason: `kb-override ${override.record.conceptId}`,
  };
}

/**
 * The `review:*` facts that still hold, by concept id so two on one file
 * resolve the same way twice. Superseded and rejected ones are dropped: a
 * withdrawn assertion is not one.
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
