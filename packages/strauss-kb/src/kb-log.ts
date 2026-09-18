import { z } from "zod";
import { kbAnchorLocatorSchema } from "./kb-record.schema.js";

export const LOG_FILE = "log.jsonl";

/**
 * One pointer change, as an `anchor-set` entry records it: `from` for a move or
 * a drop, `to` for a move or an addition. Locators only — the log says which
 * pointer moved, never what it was hashed against. Derived from the record
 * before and after, so it reports what happened rather than what was asked.
 */
export const kbLogAnchorChangeSchema = z
  .object({
    op: z.enum(["move", "add", "drop"]),
    from: kbAnchorLocatorSchema.optional(),
    to: kbAnchorLocatorSchema.optional(),
  })
  .strict();

const kbLogEntryFields = z.object({
  // Validated, not just `min(1)`: `at` is a sort key (see `parseLog`
  // below), and a value that isn't actually chronological — a Unix
  // timestamp, a human-typed date, garbage — would sort wrong without
  // ever failing to parse. `z.iso.datetime()` accepts exactly what
  // `record()` writes (`Date#toISOString()`: full precision, `Z` offset)
  // and rejects everything else, including a non-`Z` offset — so a
  // malformed `at` is reported the same way a malformed line already is,
  // rather than silently sorting into the wrong place.
  at: z.iso.datetime(),
  by: z.string().min(1),
  operation: z.string().min(1),
  conceptId: z.string().min(1),
  /**
   * The operation's other end, where it has one: a second concept id for
   * supersession, the other base's path for promotion.
   */
  target: z.string().min(1).optional(),
  /**
   * Why the operation was performed, where the operation demands one.
   * `anchor-set` does: a pointer moved by a reader is only auditable if
   * the reading is recorded beside it.
   */
  reason: z.string().min(1).optional(),
  /** What `anchor-set` changed, derived from the record before and after. */
  anchors: z.array(kbLogAnchorChangeSchema).optional(),
});

/**
 * Read-side, and tolerant of a key it has never heard of: one base is read by
 * every version that touches the repository, so a log has to read *forward*.
 * Under `.strict()` the first version to add a field turned its own entries
 * into `malformed` for every older reader — the entries an audit most needs
 * were the only ones that vanished. A line missing a required field, or
 * carrying an `at` that is not an ISO datetime, is still malformed.
 */
export const kbLogEntrySchema = kbLogEntryFields.passthrough();

/** Write-side: this package controls exactly what it appends. */
export const kbLogEntryWriteSchema = kbLogEntryFields.strict();

export type KbLogEntry = z.infer<typeof kbLogEntryFields>;
export type KbLogAnchorChange = z.infer<typeof kbLogAnchorChangeSchema>;

/**
 * The log is the bundle's only primary artifact, and the reason it is handled
 * unlike `INDEX.md`.
 *
 * The index is derived: lose it and the records rebuild it. The log records
 * events — which agent wrote what, and when — that leave no trace in the record
 * set, so it cannot be regenerated from anything. Repair therefore means detect
 * and report, never rewrite: rewriting an append-only log destroys the only
 * copy of what it holds.
 *
 * JSONL rather than a markdown list. An earlier version rendered entries as
 * `- <at> · <by> · <op> · <id>` and parsed them by splitting on the separator —
 * a hand-written parser for a format invented here, which fails the first time
 * a value contains the separator. JSON needs no parser and the schema below
 * needs no separator to be unambiguous. Humans read the log through
 * `strauss-kb log`, as they read everything else.
 *
 * One line per entry, appended with `O_APPEND`: POSIX makes the offset update
 * atomic, and writes this size do not interleave on a local filesystem.
 */
export function renderLogEntry(entry: KbLogEntry): string {
  return `${JSON.stringify(kbLogEntryWriteSchema.parse(entry))}\n`;
}

export type KbLogReadResult = {
  entries: KbLogEntry[];
  /** Lines that did not parse, with their 1-based position. Never rewritten. */
  malformed: { line: number; text: string }[];
  /** Whether the file still carried merge conflict markers. */
  conflicted: boolean;
};

/**
 * GitHub's merge button ignores `.gitattributes`, so a pull request that
 * touches the log from both sides lands conflict markers in it. Both sides'
 * entries are real; the markers are not, and reading past them keeps `kb_log`
 * working on a file nobody has resolved yet. `|||||||` is diff3's base
 * section, which `merge.conflictStyle` adds to the other three.
 */
const CONFLICT_MARKER = /^(<{7}|\|{7}|={7}|>{7})/;

export function parseLog(raw: string): KbLogReadResult {
  const entries: KbLogEntry[] = [];
  const malformed: { line: number; text: string }[] = [];
  const seen = new Set<string>();
  let conflicted = false;

  raw.split("\n").forEach((text, index) => {
    if (!text.trim()) return;
    if (CONFLICT_MARKER.test(text)) {
      conflicted = true;
      return;
    }
    let value: unknown;
    try {
      value = JSON.parse(text) as unknown;
    } catch {
      malformed.push({ line: index + 1, text });
      return;
    }
    const parsed = kbLogEntrySchema.safeParse(value);
    if (!parsed.success) {
      malformed.push({ line: index + 1, text });
      return;
    }

    // A union merge keeps both sides' lines even when a line appears on
    // both — a cherry-pick or rebase that carried one worktree's entry into
    // the other's history before the merge produces two byte-identical
    // lines for what was genuinely one event. Dropping the repeat is the
    // right read here: two writers independently logging the *same*
    // `at`/`by`/`operation`/`conceptId`/`target` is not a real scenario
    // `record()` can produce (each call mints its own `at`), so an exact
    // duplicate is merge residue, not two events that happen to coincide.
    // A near-duplicate (same fields but a different `at`) is left alone —
    // that is two genuine events and both stay.
    const key = JSON.stringify(parsed.data);
    if (seen.has(key)) return;
    seen.add(key);

    entries.push(parsed.data);
  });

  // A union merge (see `kb-gitattributes.ts`) interleaves two worktrees'
  // appends by whatever order git's merge happened to visit them in, not by
  // when each entry was actually written. Sorting on `at` here means line
  // order in the file is never load-bearing — only the timestamp is. `at` is
  // `Date#toISOString`, so lexicographic order is chronological order; the
  // sort is stable, so entries that share a timestamp keep their file order.
  entries.sort((left, right) =>
    left.at < right.at ? -1 : left.at > right.at ? 1 : 0,
  );

  return { entries, malformed, conflicted };
}
