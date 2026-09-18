---
type: decision
title: >-
  Body citations are read from a CommonMark AST (mdast-util-from-markdown), not
  matched by pattern
description: >-
  The migration writes what this parser returns, so a code example read as prose
  becomes an edge nobody stated, and a nested-list citation read as code becomes
  an edge lost at upgrade.
generated:
  by: mcp
  at: "2026-09-18T15:25:00.960Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/body-citations.ts
    symbol: bodyCitations
    hash: "sha256:a3df9190aa20aa6e894967a34509842c29b0400ffadf4524e88e7ae006985b5c"
    hash_kind: ast
    resolved_at: "2026-09-18T15:25:22.985Z"
    lines: 12
    resolver: tree-sitter
  - file: packages/strauss-kb/tsup.config.ts
    hash: "sha256:dda618aed40f727163b91a3139db19534765fd8ebc9f1282b9dc09d47424c2c4"
    hash_kind: raw
    resolved_at: "2026-09-18T15:25:22.986Z"
    lines: 44
  - file: packages/strauss-kb/package.json
    hash: "sha256:eea48addaf91270c80f7cef238ded31a4ae8bfd1693722720dbd4ed8d3d02685"
    hash_kind: raw
    resolved_at: "2026-09-18T15:25:22.987Z"
    lines: 79
strauss_links:
  - target: risk.an-indented-fence-is-still-a-citation
    rel: informs
  - target: decision.strauss-links-is-the-one-representation
    rel: depends_on
strauss_status: accepted
---

## Decision

`bodyCitations` parses the body with `mdast-util-from-markdown` and takes `link` nodes whose url is `<concept-id>.md`. Code — fenced at any indent, indented blocks, inline spans — never produces a link node, so it needs no rule of its own. The parser family is inlined into both builds by tsup's `noExternal`, because it ships ESM only and the CJS build exists precisely so a consumer need not rely on `require(esm)`.

## Rationale

The hand-rolled reader was wrong three times inside one change: no fence awareness, then an inline-span regex that a longer backtick run re-paired, then fences and indented blocks under list items. The last cannot be fixed by pattern at all — whether four spaces of indentation is code depends on list structure, and each hand-rolled rule fails one direction or the other. `markdown.ts` already borrows gray-matter rather than reading frontmatter by hand, for the same reason. The sibling Strauss repository uses the same package (`packages/document-anchoring`), and it was already in this lockfile through the docs site.

## Rejected

Keeping the hand-rolled reader and erring toward code (drops a real citation inside a nested list) or toward prose (writes a `related_to` from an example). Also rejected: `remark`/`unified` — the full processor pipeline is more than a read of links needs. And a dynamic `import()` to keep the dependency external: it would make `bodyCitations` async, and `validateBundle` with it.

## Impact

strauss-kb gains a runtime dependency, inlined, adding roughly 0.3 MB to each build. Only inline links count; a reference-style link (`[x][ref]` with a definition) does not, which matches the old reader and `compose`'s own output.

Informs [risk.an-indented-fence-is-still-a-citation](risk.an-indented-fence-is-still-a-citation.md).

Depends on [decision.strauss-links-is-the-one-representation](decision.strauss-links-is-the-one-representation.md).
