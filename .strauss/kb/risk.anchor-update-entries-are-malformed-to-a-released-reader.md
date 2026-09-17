---
type: risk
title: >-
  Every anchor-update log entry reads as a malformed line on a published
  strauss-kb
description: The audit an actor is held to is the one another reader can see.
tags:
  - review
  - "review:security"
generated:
  by: "agent:security"
  at: "2026-09-17T18:36:10.476Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-log.ts
    symbol: kbLogEntrySchema
    hash: "sha256:d68e066fe4af4a3a854ba101dd1797fd87126322b41089ab5d36d20f7d47b1f8"
    hash_kind: raw
    resolved_at: "2026-09-17T18:45:23.030Z"
    lines: 1
    resolver: regex
strauss_links:
  - target: decision.anchor-update-audit-extends-the-log-entry
    rel: informs
strauss_status: open
strauss_materiality: important
strauss_confidence: high
---

## Risk

kbLogEntrySchema is strict, so the two new keys make an entry unparseable to any reader built before them. Reproduced against the globally installed 0.1.17: `strauss-kb log --bundle .strauss/kb` lists the four anchor-update entries under `malformed` and drops them from `entries`, while 0.1.21 from this worktree lists them and reports `malformed: []`. This session's kb_log MCP tool, served by the same 0.1.17, does the same. decision.anchor-update-audit-extends-the-log-entry claims the opposite — 'A reader that only knows the old fields ignores the new ones' — which holds for a passthrough schema, not for this one.

## Why it matters

reason and anchors exist so a pointer move made by a reader is attributable. On any machine whose CLI or MCP server is not rebuilt from this branch, those moves are absent from the history and re-reported as corruption; the entries an audit most needs are the only ones that vanish. anchor-update.spec.ts:344 tests the safe direction only (an old entry into the new reader).

## Mitigation

None in the diff. Either relax kbLogEntrySchema to passthrough for unknown keys — reading forward is the direction a log needs — or state the floor as a version bump the companion pins, and test a new entry against the old shape.

## Verification

strauss-kb log --bundle .strauss/kb under 0.1.17 vs ./node_modules/.bin/strauss-kb (0.1.21): malformed 4 vs 0, on the same file.

Informs [decision.anchor-update-audit-extends-the-log-entry](decision.anchor-update-audit-extends-the-log-entry.md).
