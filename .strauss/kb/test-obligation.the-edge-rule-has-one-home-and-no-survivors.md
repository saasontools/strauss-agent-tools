---
type: test-obligation
title: >-
  The edge rule is argued in ARCHITECTURE.md alone, and nothing still says a
  consumer reads both halves
description: >-
  The reversal left two copies of the old rule behind; four copies of the new
  one would leave more.
tags:
  - review
  - "review:docs"
generated:
  by: mcp
  at: "2026-09-17T21:48:30.885Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/ARCHITECTURE.md
    hash: "sha256:3d86d5feb596e74a012150b6c0aa05f54e8ae4c915407bf0f02d86585152a696"
    hash_kind: raw
    resolved_at: "2026-09-17T21:48:43.259Z"
    lines: 268
strauss_links:
  - target: risk.prose-is-rendering-restated-in-four-homes
    rel: satisfies
  - target: risk.the-reversed-both-halves-rule-survives-in-two-names
    rel: satisfies
  - target: risk.the-new-modules-carry-doc-comment-essays
    rel: satisfies
strauss_status: open
strauss_supersedes:
  - test-obligation.the-edge-rule-is-stated-once-per-surface
---

## Obligation

`packages/strauss-kb/ARCHITECTURE.md` and `decision.strauss-links-is-the-one-representation` are the only places the rule is argued. `specification.md` states "prose is not walked" and links; `kb-edges.ts` states the invariant in one line; a test's name carries what a comment would have said. No doc comment restates a record's reasoning, and none of the new modules runs past four lines.

Nothing anywhere says a consumer reads both halves — the phrase survived the reversal in `doctor.ts` above `orphaned` and in a `describe` block, which is how a reader would have been sent to parse prose again.

## Why it matters

`AGENTS.md` makes prose length alone a reason to reject. The specific failure is already on the record: this change rewrote the rule once, and the copies it did not reach kept asserting the opposite.

## How to verify

`grep -rn "disagree the moment\|count the edge twice" packages/strauss-kb apps/strauss-kb-docs --include='*.ts' --include='*.md'` returns exactly one line, in ARCHITECTURE.md. `grep -rn "both halves" packages/strauss-kb/src apps/strauss-kb-docs/docs plugins/strauss-kb/skills` returns only the unrelated `<base>..<head>` and concept-id uses. No comment in `kb-edges.ts`, `body-citations.ts`, `compose.ts`, `validate.ts`, `kb-references/outbound.ts` or `commands/reassess.ts` exceeds four lines.

Satisfies [risk.prose-is-rendering-restated-in-four-homes](risk.prose-is-rendering-restated-in-four-homes.md).

Satisfies [risk.the-reversed-both-halves-rule-survives-in-two-names](risk.the-reversed-both-halves-rule-survives-in-two-names.md).

Satisfies [risk.the-new-modules-carry-doc-comment-essays](risk.the-new-modules-carry-doc-comment-essays.md).
