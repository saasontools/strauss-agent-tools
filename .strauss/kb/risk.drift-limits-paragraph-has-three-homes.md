---
type: risk
title: >-
  What a span hash cannot see is written out in the specification, the skill and
  the use-cases page
description: >-
  The docs site is meant to be the one home; two copies of a rule drift apart
  silently.
tags:
  - review
  - "review:docs"
generated:
  by: "agent:prose"
  at: "2026-09-17T18:06:48.536Z"
verified: []
strauss_anchors:
  - file: plugins/strauss-kb/skills/knowledge-base/SKILL.md
    hash: "sha256:fb931a09f8dac5185f190bdbecb9cf6311d19433041880d8e2b9a48c5691945c"
    hash_kind: raw
    resolved_at: "2026-09-17T18:22:11.747Z"
    lines: 224
  - file: apps/strauss-kb-docs/docs/specification.md
    hash: "sha256:f73060dea9ae19b4aebae1699d01e2cf903c7fb66ad592be621d6656cc0fe589"
    hash_kind: raw
    resolved_at: "2026-09-17T18:22:11.748Z"
    lines: 748
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

specification.md's 'What drift does and does not see' (three bullets), SKILL.md's closing paragraph under 'When the anchor points at nothing' and use-cases.md's closing note all state that a body change drifts, an unchanged caller inherits nothing, and a config or environment change drifts nothing. Only use-cases links back to the specification; the skill restates it in full.

## Why it matters

AGENTS.md puts one home per fact, with SKILL.md carrying only what an agent needs at the moment of use. The skill copy is rationale an agent does not act on, and it is the copy that will still say the old thing after the specification is edited.

## Mitigation

None in the diff. The three copies agree today.

## Verification

None; grep for 'unanchored helper' and 'changes no bytes' lists the three files.
