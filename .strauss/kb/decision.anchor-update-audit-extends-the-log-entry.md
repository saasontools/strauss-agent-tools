---
type: decision
title: >-
  The pointer audit is optional fields on the existing log entry, not a second
  file
description: >-
  The log is the bundle's only primary artifact; a second audit trail beside it
  would be a second thing to merge, read and keep honest, and readers would have
  to know which one answered their question.
tags:
  - review
sources:
  - id: saa-820
    resource: "https://linear.app/saason/issue/SAA-820"
    title: "Strauss KB: expose reviewed anchor updates through CLI and MCP"
generated:
  by: "agent:claude"
  at: "2026-09-17T17:50:38.794Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-log.ts
    symbol: kbLogEntrySchema
    hash: "sha256:b9209e3ceeb0f771ac99a54e86f2cccf28eca3da0f8c973c0356f2e47356780e"
    hash_kind: raw
    resolved_at: "2026-09-17T17:50:45.482Z"
    lines: 28
    resolver: regex
  - file: packages/strauss-kb/src/kb-log.ts
    symbol: kbLogAnchorChangeSchema
    hash: "sha256:d80b9682cd55b4dec17f3bf931423ab83de38c9c7f0f883651dcad43e93aa1a6"
    hash_kind: raw
    resolved_at: "2026-09-17T17:50:45.486Z"
    lines: 6
    resolver: regex
strauss_status: accepted
---

## Decision

The pointer audit is optional fields on the existing log entry, not a second file

## Rationale

The log is the bundle's only primary artifact; a second audit trail beside it would be a second thing to merge, read and keep honest, and readers would have to know which one answered their question.

## Rejected

A separate anchors.jsonl, or the reason squeezed into the operation string. Rejected: the first splits one history in two, and the second makes a free-text reason part of a field the readers match on.

## Impact

kbLogEntrySchema stays strict and gains optional `reason` and `anchors`, so every entry written before this parses unchanged. A reader that only knows the old fields ignores the new ones.

[^saa-820]: Strauss KB: expose reviewed anchor updates through CLI and MCP
