---
type: decision
title: >-
  The drift-limits rule lives in the specification; the rationale for
  anchor-update lives in the records
description: >-
  A fact with two homes disagrees after the first edit, and the copy nobody
  rechecks is the one a reader trusts.
tags:
  - review
generated:
  by: "agent:claude"
  at: "2026-09-17T18:21:57.311Z"
verified: []
strauss_anchors:
  - file: plugins/strauss-kb/skills/knowledge-base/SKILL.md
    hash: "sha256:fb931a09f8dac5185f190bdbecb9cf6311d19433041880d8e2b9a48c5691945c"
    hash_kind: raw
    resolved_at: "2026-09-17T18:22:07.822Z"
    lines: 224
  - file: packages/strauss-kb/src/kb-store.ts
    symbol: updateAnchors
    hash: "sha256:a3af337f051a491a29e61ea7534e6cd111db984e1c59631df24862aa7e0276b0"
    hash_kind: ast
    resolved_at: "2026-09-17T18:22:07.851Z"
    lines: 30
    resolver: tree-sitter
strauss_links:
  - target: risk.drift-limits-paragraph-has-three-homes
    rel: informs
  - target: risk.anchor-update-rationale-restated-in-comments-and-records
    rel: informs
strauss_status: accepted
---

## Decision

The drift-limits rule lives in the specification; the rationale for anchor-update lives in the records

## Rationale

A fact with two homes disagrees after the first edit, and the copy nobody rechecks is the one a reader trusts.

## Rejected

Leave the skill's full restatement so an agent needs no second page. Rejected: the skill carries what an agent acts on at the moment of use, and three bullets of coverage theory is not that.

## Impact

SKILL.md keeps one operative line — clean anchors do not mean nothing changed — and the three bullets stay only in specification.md, which use-cases.md links. The doc comments on updateAnchors, applyAnchorPatch, replacement, the locator schemas and the anchor-update errors are cut to the invariant, each naming the record that holds the argument.

Informs [risk.drift-limits-paragraph-has-three-homes](risk.drift-limits-paragraph-has-three-homes.md).

Informs [risk.anchor-update-rationale-restated-in-comments-and-records](risk.anchor-update-rationale-restated-in-comments-and-records.md).
