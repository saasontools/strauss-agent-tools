---
type: risk
title: >-
  withoutCodeSpans is quadratic in backtick runs per line, on the verb the
  reviewer gate spawns
description: >-
  One 125 KB body turns validate from 154 ms into 2.4 s; the cause is a
  findIndex that restarts at 0.
tags:
  - review
  - "review:performance"
generated:
  by: "agent:performance"
  at: "2026-09-17T21:47:48.914Z"
verified:
  - by: "agent:security"
    at: "2026-09-17T21:52:48.318Z"
    note: >-
      Holds, and it is reachable from contributed data: a record file arrives
      with a PR, body is z.string() with no bound, and validate plus doctor
      --strict are what the reviewer gate spawns. Reproduced on the dist built
      at HEAD with one record whose body is a single line of backtick runs of
      increasing length interleaved with short spans: 362 KB costs 4.6 s of
      validate, 1.4 MB costs 73 s (mirror-links pays the same 73 s on the same
      bundle). Control: the identical 1.4 MB file with every backtick replaced
      by a letter validates in 0.18 s, so the cost is withoutCodeSpans, not IO
      or YAML. Security reading only - the repair and the numbers are yours.
strauss_anchors:
  - file: packages/strauss-kb/src/body-citations.ts
    symbol: withoutCodeSpans
  - file: packages/strauss-kb/src/validate.ts
    symbol: validateBundle
    hash: "sha256:37fcb846d49f6a7290d64f4327669afd3e50ff59a91b825c34dc6b3cf71cb19c"
    hash_kind: ast
    resolved_at: "2026-09-18T15:25:24.836Z"
    lines: 163
    resolver: tree-sitter
strauss_links:
  - target: decision.strauss-links-is-the-one-representation
    rel: informs
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

body-citations.ts `withoutCodeSpans` finds each span's closing run with `runs.findIndex((run, at) => at > open && ...)`. `findIndex` always starts at index 0, so closing run k is found only after re-scanning the k runs already consumed: the pass is O(r^2) in the backtick runs on one line even when every span is a well-formed adjacent pair. `prose()` calls it per unfenced line, and record `body` is `z.string()` with no length bound.

## Why it matters

Measured against the built `dist/cli-main.js` on a ten-record bundle where one record's body is a single line of k inline-code runs: `validate` is 154 ms at k=0, 194 ms at k=8000 (15.6 KB), 737 ms at k=32000 (62.5 KB) and 2395 ms at k=64000 (125 KB) — 4x per doubling. `doctor` tracks it (162/181/716/2370 ms) because `brokenSupersession` calls `validateBundle`. `validate` and `doctor --strict` are what the reviewer gate spawns per base state, under one wall deadline, so a base carrying such a record spends the deadline here. The parser is also new in this range: the same body costs 0.024 ms through it against 0.004 ms through the single regex it replaced.

## Mitigation

None. No real body is near the threshold — the largest backtick-run count on one line in this base is 22, on a 419-byte line — so nothing degrades today. The repair is one line: scan for the close from `open + 1` instead of calling `findIndex` from 0. Measured on the same inputs, same output byte-for-byte: 64000 runs goes from 2288 ms to 4.6 ms, and the genuine worst case (runs of strictly increasing length, where no pair ever matches) stays under 1 ms at 321 KB because distinct lengths cost bytes.

## Verification

A record whose body is one line of 64000 `` `x `` runs: `strauss-kb validate` returns in about the time it takes on a plain body, not 2.4 s.

Informs [decision.strauss-links-is-the-one-representation](decision.strauss-links-is-the-one-representation.md).
