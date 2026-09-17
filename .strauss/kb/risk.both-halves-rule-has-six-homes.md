---
type: risk
title: >-
  The "a reference is both halves" rule is restated in six prose homes and a
  dozen comments
description: "AGENTS.md: one home per fact; copies disagree when the rule changes."
tags:
  - review
  - "review:docs"
generated:
  by: "agent:prose"
  at: "2026-09-17T19:08:34.555Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/ARCHITECTURE.md
    hash: "sha256:3d86d5feb596e74a012150b6c0aa05f54e8ae4c915407bf0f02d86585152a696"
    hash_kind: raw
    resolved_at: "2026-09-17T21:35:08.966Z"
    lines: 268
strauss_links:
  - target: decision.edge-consumers-read-body-and-frontmatter
    rel: informs
strauss_status: open
strauss_materiality: important
strauss_confidence: high
---

## Risk

SAA-821 states the rule in ARCHITECTURE.md, README.md (l.466), cli-reference.md (l.237 and l.751), mcp-reference.md (l.186) and SKILL.md (l.160), plus doc comments in kb-references/index.ts, kb-references/model.ts, outbound.ts, stale.ts, sweep.ts, validate.ts, doctor.ts, packet.ts and reassess.ts. One sentence is already verbatim in two files: packet.ts:91 and drift.spec.ts:370.

## Why it matters

The next change to the rule edits some copies. A reader then gets the old rule from whichever home they opened.

## Mitigation

None taken. The rule and its reason belong in ARCHITECTURE.md and decision.edge-consumers-read-body-and-frontmatter; the README links to the docs site, and a comment states the invariant in <= 4 lines.

## Verification

grep -rn "both halves" over docs, README, SKILL.md and packages/strauss-kb/src returns one statement of the rule per surface.

Informs [decision.edge-consumers-read-body-and-frontmatter](decision.edge-consumers-read-body-and-frontmatter.md).
