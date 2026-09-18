---
type: test-obligation
title: >-
  No code block of any kind yields a citation, and a nested-list citation still
  does
description: >-
  Both directions of the parser's error reach the base through mirror-links: one
  invents an edge, the other loses one.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-18T15:25:10.637Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/body-citations.ts
    symbol: bodyCitations
    hash: "sha256:a3df9190aa20aa6e894967a34509842c29b0400ffadf4524e88e7ae006985b5c"
    hash_kind: ast
    resolved_at: "2026-09-18T15:25:23.241Z"
    lines: 12
    resolver: tree-sitter
strauss_links:
  - target: risk.an-indented-fence-is-still-a-citation
    rel: satisfies
strauss_status: open
---

## Obligation

`bodyCitations` returns nothing for a link inside a fence at column 0, a fence indented under a list item, a four-space indented block, or a code span — including a span after a longer backtick run on the same line. It returns the citation for a link in a nested list item and in a list item's indented continuation paragraph. Only an inline link whose url is exactly `<concept-id>.md` counts. The CJS build loads and answers the same.

## Why it matters

`mirror-links` writes each returned id as a `related_to`, which then holds records in `sweep`; a dropped id is an edge lost at upgrade with no warning.

## How to verify

`src/body-citations.spec.ts` — the fence and indented-block repro returns `[]`, the nested-list case returns both ids, and the url filter keeps only `fact.ok`. `test/dist.spec.ts` loads `dist/index.cjs`, which inlines the parser.

Satisfies [risk.an-indented-fence-is-still-a-citation](risk.an-indented-fence-is-still-a-citation.md).
