---
type: test-obligation
title: >-
  mirror-links computes each addition inside the write, so a concurrent link
  survives
description: >-
  The migration read the base once and wrote each record's links from that
  snapshot, overwriting anything written in between.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-18T15:46:26.702Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-store.ts
    symbol: mirrorLinks
strauss_links:
  - target: risk.mirror-links-writes-links-from-a-stale-snapshot
    rel: satisfies
strauss_status: open
---

## Obligation

`KbStore.mirrorLinks` takes the targets to add, not a replacement list, and computes the new `strauss_links` inside the store's mutation from the frontmatter it reads there. A link written after the run listed the base is kept, and a target named by it is not added a second time. `updateLinks` — a whole-list overwrite — is gone.

## Why it matters

A migration run while an agent is writing records would silently drop that agent's links, which is the one kind of edge this change exists to protect.

## How to verify

`src/commands/mirror-links.spec.ts` — "keeps a link written after the run read the base" writes a `depends_on` into the record between the run's `list` and its write, and asserts both that link and the mirrored `related_to` are present afterwards.

Satisfies [risk.mirror-links-writes-links-from-a-stale-snapshot](risk.mirror-links-writes-links-from-a-stale-snapshot.md).
