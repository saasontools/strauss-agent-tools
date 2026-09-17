---
type: test-obligation
title: A log entry from a later version parses here rather than reading as corruption
description: >-
  One base is read by every version that touches the repository; a reader that
  refuses a field it has never heard of loses exactly the entries an audit
  needs.
tags:
  - review
generated:
  by: "agent:claude"
  at: "2026-09-17T18:45:14.667Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-log.ts
    symbol: kbLogEntrySchema
    hash: "sha256:d68e066fe4af4a3a854ba101dd1797fd87126322b41089ab5d36d20f7d47b1f8"
    hash_kind: raw
    resolved_at: "2026-09-17T18:45:25.745Z"
    lines: 1
    resolver: regex
  - file: packages/strauss-kb/src/kb-log.ts
    symbol: kbLogEntryWriteSchema
    hash: "sha256:44586889051e9be6649ec306bd39cbfe3746a115413644b7c4e0df2174300b31"
    hash_kind: raw
    resolved_at: "2026-09-17T18:45:25.747Z"
    lines: 1
    resolver: regex
strauss_links:
  - target: risk.anchor-update-entries-are-malformed-to-a-released-reader
    rel: satisfies
strauss_status: open
---

## Obligation

parseLog accepts an entry carrying an unknown key, returning it in `entries` with `malformed` empty, and still reports a line missing a required field as malformed. The write schema stays strict, so this package cannot append a key by accident.

## Why it matters

This is the half that cannot be fixed retroactively: a reader older than 0.1.22 already refuses these lines, and the schema change is what stops the next added field doing it again.

## How to verify

packages/strauss-kb/src/commands/anchor-update/anchor-update.spec.ts — "an entry from a reader that has never heard of a field still parses" and "a line missing a required field is still malformed".

Satisfies [risk.anchor-update-entries-are-malformed-to-a-released-reader](risk.anchor-update-entries-are-malformed-to-a-released-reader.md).
