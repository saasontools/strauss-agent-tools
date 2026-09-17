---
type: decision
title: The log's read schema keeps unknown keys; the write schema stays strict
description: >-
  One base is read by every version that touches the repository, so a reader
  that refuses a field it has never heard of loses exactly the entries an audit
  needs.
tags:
  - review
sources:
  - id: saa-820
    resource: "https://linear.app/saason/issue/SAA-820"
    title: "Strauss KB: expose reviewed anchor updates through CLI and MCP"
generated:
  by: "agent:claude"
  at: "2026-09-17T20:11:25.729Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-log.ts
    symbol: kbLogEntrySchema
    hash: "sha256:d68e066fe4af4a3a854ba101dd1797fd87126322b41089ab5d36d20f7d47b1f8"
    hash_kind: raw
    resolved_at: "2026-09-17T20:11:53.026Z"
    lines: 1
    resolver: regex
  - file: packages/strauss-kb/src/kb-log.ts
    symbol: kbLogEntryWriteSchema
    hash: "sha256:44586889051e9be6649ec306bd39cbfe3746a115413644b7c4e0df2174300b31"
    hash_kind: raw
    resolved_at: "2026-09-17T20:11:53.028Z"
    lines: 1
    resolver: regex
strauss_status: accepted
---

## Decision

The log's read schema keeps unknown keys; the write schema stays strict

## Rationale

One base is read by every version that touches the repository, so a reader that refuses a field it has never heard of loses exactly the entries an audit needs.

## Rejected

Keep the strict read schema and state a version floor. Rejected: this branch's own two fields already made every anchor-set line malformed to a released reader, and a floor does not stop the next added field doing it again.

## Impact

A line missing a required field, or with a non-ISO `at`, is still malformed. A typo'd key no longer flags a line, which is the price. Nothing can be done for readers older than this release; their `strauss-kb log` reports these entries under `malformed` and drops them from `entries`.

[^saa-820]: Strauss KB: expose reviewed anchor updates through CLI and MCP
