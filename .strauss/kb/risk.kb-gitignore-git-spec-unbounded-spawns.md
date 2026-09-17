---
type: risk
title: "The git spec spawns check-ignore per file name, under no timeout"
description: A synchronous spawn with no timeout cannot be interrupted by vitest.
tags:
  - review
  - "review:performance"
generated:
  by: "agent:performance"
  at: "2026-09-17T18:00:35.452Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-gitignore.git.spec.ts
    hash: "sha256:9a4b5e2a5a73ae2d446bbded6380b43743ccd3a5a03fb3546b7bf8c9e68da921"
    hash_kind: raw
    resolved_at: "2026-09-17T18:42:12.753Z"
    lines: 197
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

kb-gitignore.git.spec.ts spawns git about 19 times: one init per test and one check-ignore per asserted path, two of them inside loops over sibling file names. Measured on this machine: 25 ms per check-ignore, 57 ms per init; the file runs in 2.13 s against 1.09 s for its pure-unit sibling kb-gitignore.spec.ts. Both execFileSync calls omit `timeout`, and a synchronous spawn blocks the worker thread, so vitest's per-test timeout cannot end a hung git — the suite hangs rather than failing.

## Why it matters

Test wall time is a hot path for every contributor, and an unkillable spawn turns a stuck git (index.lock, a slow network filesystem under TMPDIR) into a hung CI job with no failing test to name.

## Mitigation

None taken. `git check-ignore --no-index -v --non-matching <paths...>` answers every path in one spawn, removing about 6 spawns (~150 ms), and a `timeout` option on both execFileSync calls bounds the rest.

## Verification

Time the file: `pnpm vitest run src/kb-gitignore.git.spec.ts` against src/kb-gitignore.spec.ts.
