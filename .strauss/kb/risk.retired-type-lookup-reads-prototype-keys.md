---
type: risk
title: >-
  The write type error map indexes a plain object with user input, so prototype
  keys lose the custom message
description: "RETIRED_RECORD_TYPES[String(issue.input)] is truthy for inherited keys."
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-19T06:13:45.143Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/write.ts
    symbol: writeCommand
    hash: "sha256:861951350c190c727e647b6091a95e1db29bcfc0669ac5d64ff91f7781593746"
    hash_kind: raw
    resolved_at: "2026-09-19T06:18:31.383Z"
    lines: 37
    resolver: regex
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

writeCommand's error callback returns RETIRED_RECORD_TYPES[String(issue.input)] ?? fallback. For type 'constructor', 'toString' or '**proto**' the lookup returns Object.prototype members, not undefined, so the ?? fallback is skipped and zod discards the non-string, printing its default 'Invalid option: expected one of ...' instead of 'type must be one of ...'. Checked with strauss-kb write constructor.

## Why it matters

Low: the write is still refused; only the message is inconsistent. It becomes wrong if a future caller treats a truthy lookup as 'this type is retired'.

## Mitigation

None in the diff. Use Object.hasOwn(RETIRED_RECORD_TYPES, key) or a Map.

## Verification

strauss-kb write constructor < record.json prints 'type must be one of'.
