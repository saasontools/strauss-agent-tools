---
type: risk
title: >-
  Six homes tell a reader to run mirror-links before upgrading, but it ships
  only in the upgrade
description: >-
  The migration instruction cannot be followed as written, and it has six
  copies.
tags:
  - review
  - "review:docs"
generated:
  by: "agent:prose"
  at: "2026-09-18T15:35:12.917Z"
verified: []
strauss_anchors:
  - file: apps/strauss-kb-docs/docs/cli-reference.md
  - file: packages/strauss-kb/src/commands/mirror-links.ts
    symbol: mirrorLinksCommand
strauss_links:
  - target: risk.unmigrated-base-loses-prose-edges
    rel: informs
strauss_status: open
strauss_materiality: important
strauss_confidence: high
---

## Risk

mirror-links is new in this range, yet the version plan, README.md:467, SKILL.md:161-162, cli-reference.md:795, mcp-reference.md:527 and the kb_mirror_links description all say to run it before upgrading. What sweep needs is: upgrade, run mirror-links, then sweep.

## Why it matters

A reader cannot follow the instruction, so they guess the order, and sweep deletes on a wrong guess. Six copies of one fact will also drift apart.

## Mitigation

None in the diff. Say 'after upgrading, before the first sweep' once, in cli-reference.md#mirror-links. The version plan keeps its release note, and the README, SKILL.md, mcp-reference and the tool description link to it or state the one instruction.

## Verification

grep -rn 'before upgrading' apps/strauss-kb-docs packages/strauss-kb plugins/strauss-kb .nx/version-plans returns nothing.

Informs [risk.unmigrated-base-loses-prose-edges](risk.unmigrated-base-loses-prose-edges.md).
