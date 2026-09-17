import { KB_CONCEPT_ID_PATTERN, type KbRecord } from "./kb-record.schema.js";

/**
 * Markdown citations in a record's prose.
 *
 * Not an edge: `strauss_links` is. Two callers, `validate` and `mirror-links`.
 */

// The target of any markdown link whose href is a record filename:
// `](<concept-id>.md)`. Built from the id pattern with its anchors stripped so
// the id can be matched mid-body.
const BODY_LINK_TARGET = new RegExp(
  `\\]\\((${KB_CONCEPT_ID_PATTERN.source.replace(/^\^|\$$/g, "")})\\.md\\)`,
  "g",
);

/**
 * Every concept id this record's prose cites, itself excluded.
 *
 * Code is not prose: a link inside a fence or a code span is an example.
 */
export function bodyCitations(record: KbRecord): Set<string> {
  const targets = new Set<string>();
  for (const match of prose(record.body).matchAll(BODY_LINK_TARGET)) {
    const target = match[1];
    if (target && target !== record.conceptId) targets.add(target);
  }
  return targets;
}

/**
 * The body with fenced blocks and inline code spans removed. A fence closes on
 * a marker of its own kind and at least its own length, per CommonMark, and an
 * unclosed one runs to the end of the record.
 */
function prose(body: string): string {
  const kept: string[] = [];
  let fence: string | null = null;
  for (const line of body.replace(/\r\n/g, "\n").split("\n")) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (marker) {
      fence = marker;
      continue;
    }
    kept.push(withoutCodeSpans(line));
  }
  return kept.join("\n");
}

/**
 * One line with its code spans removed. A span closes on a backtick run of its
 * own length, so a longer run in the middle of a line cannot re-pair the spans
 * after it; a run that never closes is literal text.
 */
function withoutCodeSpans(line: string): string {
  const runs = [...line.matchAll(/`+/g)].map((run) => ({
    at: run.index ?? 0,
    length: run[0].length,
  }));
  let out = "";
  let cursor = 0;
  for (let open = 0; open < runs.length; open += 1) {
    const start = runs[open];
    if (!start || start.at < cursor) continue;
    const close = runs.findIndex(
      (run, at) => at > open && run.length === start.length,
    );
    if (close < 0) continue;
    const end = runs[close];
    if (!end) continue;
    out += line.slice(cursor, start.at);
    cursor = end.at + end.length;
    open = close;
  }
  return out + line.slice(cursor);
}
