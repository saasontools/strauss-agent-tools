---
type: risk
title: >-
  Every mutation re-reads both declaration files; a promote of N records costs
  6N reads
description: The store's only mutation path gained an I/O with no measurement beside it.
tags:
  - review
  - "review:performance"
generated:
  by: "agent:performance"
  at: "2026-09-17T18:00:24.319Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-store.ts
    symbol: KbStore.ensureDeclared
    hash: "sha256:2bc4a14e63eb792f3420c25eeb4095067f2d8d00176ad0eab93a593b8b36cc4c"
    hash_kind: ast
    resolved_at: "2026-09-17T18:22:07.062Z"
    lines: 68
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-store.ts
    symbol: KbStore.record
    hash: "sha256:b2dd9fd5139d2345b87f81f93f08fdf824d5379a586970864afe3edfa6be1ab7"
    hash_kind: ast
    resolved_at: "2026-09-17T18:22:07.064Z"
    lines: 17
    resolver: tree-sitter
strauss_links:
  - target: flow.kb-ignore-written-on-first-write
    rel: informs
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

ensureDeclared reads its target on every call and nothing memoises the result per store instance, so record() now does two reads where it did one. Measured on macOS/APFS: 0.093 ms for the single .gitattributes read before, 0.135 ms for the Promise.all pair after — +0.04 ms per mutation. promote calls record() three times per record (write, note(target), note(from)), so a promote of N records does 6N declaration reads across two roots: 0.52 ms per record, 52 ms at N=100, up from 26 ms.

## Why it matters

Linear in records promoted, and the redundant reads are on files that cannot have changed since the first call in the same process. A Set of roots already ensured on the KbStore instance would make it two reads per process.

## Mitigation

None taken, and the trade is real: a memo stops repairing a declaration file deleted mid-process, which kb-store.spec's 'is repaired by setStatus' covers within one store instance. Keeping the read is defensible; what is missing is the number, now recorded here.

## Verification

Benchmark in this record's Risk section, rerunnable: readFile of a one-line .gitignore against Promise.all of both reads, 2000 iterations.

Informs [flow.kb-ignore-written-on-first-write](flow.kb-ignore-written-on-first-write.md).
