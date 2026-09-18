import { fromMarkdown } from "mdast-util-from-markdown";
import { KB_CONCEPT_ID_PATTERN, type KbRecord } from "./kb-record.schema.js";

/**
 * Markdown citations in a record's prose.
 *
 * Not an edge: `strauss_links` is. Two callers, `validate` and `mirror-links`.
 */

// A link whose href is a record filename, `<concept-id>.md`.
const RECORD_FILE = new RegExp(
  `^(${KB_CONCEPT_ID_PATTERN.source.replace(/^\^|\$$/g, "")})\\.md$`,
);

type MdNode = { type: string; url?: string; children?: MdNode[] };

/**
 * Every concept id this record's prose cites, itself excluded.
 *
 * Parsed as CommonMark rather than matched by pattern: a link in a fence, an
 * indented block or a code span is an example, and only a parser knows which.
 */
export function bodyCitations(record: KbRecord): Set<string> {
  const targets = new Set<string>();
  const visit = (node: MdNode): void => {
    if (node.type === "link" && node.url) {
      const target = RECORD_FILE.exec(node.url)?.[1];
      if (target && target !== record.conceptId) targets.add(target);
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(fromMarkdown(record.body) as MdNode);
  return targets;
}
