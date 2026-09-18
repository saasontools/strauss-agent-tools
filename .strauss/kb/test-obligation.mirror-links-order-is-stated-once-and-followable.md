---
type: test-obligation
title: "The migration's order is the one a reader can follow, and it has one home"
description: >-
  The instruction shipped as "run it before upgrading" for a command the upgrade
  itself ships; a reader guessing the order is a reader sweep deletes on.
tags:
  - review
  - "review:docs"
generated:
  by: mcp
  at: "2026-09-18T15:40:09.811Z"
verified: []
strauss_anchors:
  - file: apps/strauss-kb-docs/docs/cli-reference.md
  - file: packages/strauss-kb/src/commands/mirror-links.ts
    symbol: mirrorLinksCommand
strauss_links:
  - target: risk.mirror-links-told-to-run-before-the-upgrade-that-ships-it
    rel: satisfies
strauss_status: open
---

## Obligation

The order is: upgrade, run `mirror-links` once per base, then the first `sweep`. `cli-reference.md#mirror-links` states it with its reason. The version plan carries it as the release note's lead; the README, `mcp-reference.md`, the knowledge-base `SKILL.md` and the `kb_mirror_links` tool description state the one instruction or link to it, and none argues it.

## Why it matters

Nothing between the upgrade and the migration fails loudly: read verbs under-report and `sweep --dry-run` answers from the same blind index. The only protection is an instruction that can be followed.

## How to verify

`grep -rn "before upgrading" apps/strauss-kb-docs packages/strauss-kb plugins/strauss-kb .nx/version-plans --include='*.md' --include='*.ts'` returns nothing, and `grep -rn "before the first" ` over the same paths finds the instruction in each surface named above.

Satisfies [risk.mirror-links-told-to-run-before-the-upgrade-that-ships-it](risk.mirror-links-told-to-run-before-the-upgrade-that-ships-it.md).
