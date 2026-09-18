---
type: test-obligation
title: >-
  A line nesting more than 64 lists is refused before parsing, and mirror-links
  names it and migrates the rest
description: >-
  The parser's cost is quadratic in list nesting on one line — 8,000 nested
  markers took nine seconds — and every gate run parses every body.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-18T15:52:17.885Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/body-citations.ts
    symbol: nestingAt
  - file: packages/strauss-kb/src/commands/mirror-links.ts
    symbol: mirrorLinksCommand
strauss_links:
  - target: risk.a-nested-body-crashes-validate-and-the-author-gate-reads-it-as-clean
    rel: satisfies
strauss_status: open
---

## Obligation

`bodyCitations` scans each line once and throws `KbBodyUnreadableError` naming the record when a line opens more than 64 nested lists (`*`, `+`, `-`, or an ordered marker, past any `>`). Blockquote depth is not counted: the parser handles it in linear time. `validate` reports the refusal as that record's `body_link` warning; `mirror-links` lists it under `unreadable` with its reason and mirrors every other record.

## Why it matters

One 16 KB record held `validate` and `doctor --strict` for nine seconds each, per run, on every review. A migration aborted by one hostile record strands the rest of the base unmigrated, which is the sweep hazard itself.

## How to verify

`src/body-citations.spec.ts` — 8,000 nested `* ` markers are refused naming the record in under 500 ms, and ten nested `-` or `1.` markers still yield the citation. `src/commands/mirror-links.spec.ts` — "names an unreadable body and mirrors the rest".

Satisfies [risk.a-nested-body-crashes-validate-and-the-author-gate-reads-it-as-clean](risk.a-nested-body-crashes-validate-and-the-author-gate-reads-it-as-clean.md).
