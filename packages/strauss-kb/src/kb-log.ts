import { z } from "zod";

export const LOG_FILE = "log.jsonl";

export const kbLogEntrySchema = z
  .object({
    at: z.string().min(1),
    by: z.string().min(1),
    operation: z.string().min(1),
    conceptId: z.string().min(1),
    /** Second concept id, where the operation relates two — supersession. */
    target: z.string().min(1).optional(),
  })
  .strict();

export type KbLogEntry = z.infer<typeof kbLogEntrySchema>;

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
  return `${JSON.stringify(kbLogEntrySchema.parse(entry))}\n`;
}

export type KbLogReadResult = {
  entries: KbLogEntry[];
  /** Lines that did not parse, with their 1-based position. Never rewritten. */
  malformed: { line: number; text: string }[];
};

export function parseLog(raw: string): KbLogReadResult {
  const entries: KbLogEntry[] = [];
  const malformed: { line: number; text: string }[] = [];

  raw.split("\n").forEach((text, index) => {
    if (!text.trim()) return;
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
    entries.push(parsed.data);
  });

  return { entries, malformed };
}
