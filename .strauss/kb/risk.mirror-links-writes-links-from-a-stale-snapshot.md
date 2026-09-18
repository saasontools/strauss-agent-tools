---
type: risk
title: mirror-links replaces strauss_links with a list read before the loop began
description: A link written to a record while the migration runs is silently dropped.
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-18T15:42:14.715Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/mirror-links.ts
    symbol: mirrorLinksCommand
  - file: packages/strauss-kb/src/kb-store.ts
    symbol: mirrorLinks
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

mirrorLinksCommand builds `links` from `record.frontmatter.strauss_links` in the `store.list` snapshot taken at the start, then calls `updateLinks`, whose change callback ignores the fresh frontmatter it is handed and sets `strauss_links: links`. mutate's digest witness only covers its own read-to-publish window, so a write to that record between the list and its turn in the loop (a `promote --force` into the base, a hand edit, a second tool) loses the new links, and the added citations come from the old body.

## Why it matters

The migration's purpose is to stop losing edges; this path loses edges written during it, and no conflict is reported.

## Mitigation

None in the diff. Compute the added targets inside the mutate callback from the frontmatter and body it reads, or pass the snapshot's digest and refuse on mismatch.

## Verification

A spec that adds a link to a record after `store.list` resolves and before its updateLinks (via an injected store) keeps that link after the run.
