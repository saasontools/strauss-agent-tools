---
type: test-obligation
title: >-
  No record body can overflow, crash or dominate validate, doctor or
  mirror-links
description: >-
  One hostile record took the gate's two checks and the migration down for the
  whole base, and every clean body paid for a parse it could not need.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-18T15:46:21.804Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/body-citations.ts
    symbol: bodyCitations
  - file: packages/strauss-kb/src/validate.ts
    symbol: validateBundle
strauss_links:
  - target: risk.deep-nesting-crashes-validate-and-doctor
    rel: satisfies
  - target: risk.gate-parses-every-body-as-commonmark-twice
    rel: satisfies
strauss_status: open
---

## Obligation

`bodyCitations` walks the AST with an explicit stack, so nesting depth costs memory, not stack. A body the parser refuses becomes a `KbBodyUnreadableError` naming the record; `validate` reports it as that record's `body_link` warning and carries on. A body with no `.md` in it is not parsed at all — a link node pointing at a record file needs that literal, and an autolink without a scheme is not one.

## Why it matters

`validate` and `doctor --strict` gate every review, and the reader behind them is reached by records other actors wrote. Before this, 12,000 nested `>` ended both with `Maximum call stack size exceeded` and named no record.

## How to verify

`src/body-citations.spec.ts` — twenty thousand levels of nesting return the citation at the bottom. Against the built CLI, a base holding one record of 20,000 nested `>` and a link: `validate`, `doctor` and `mirror-links --dry-run` each exit 0 and see the citation. The fast path: the performance reviewer measured the pass at 384 ms against 20.5 ms at 1,600 records with the check in place.

Satisfies [risk.deep-nesting-crashes-validate-and-doctor](risk.deep-nesting-crashes-validate-and-doctor.md).

Satisfies [risk.gate-parses-every-body-as-commonmark-twice](risk.gate-parses-every-body-as-commonmark-twice.md).
