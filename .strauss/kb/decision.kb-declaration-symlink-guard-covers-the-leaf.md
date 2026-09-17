---
type: decision
title: "The symlink guard covers the file, not the directory it sits in"
description: >-
  Both writers lstat the file they are about to touch and refuse a symlink
  there. A directory checked in as a symlink — `<workspace>/.strauss`, or a
  base's own path — is not checked, so `mkdir -p` and the write follow it.
  Closing that means opening the directory once and working relative to the
  descriptor, with O_NOFOLLOW on the leaf and appends against the handle: a
  different I/O shape for the whole store, not a guard in this diff. The leaf
  case is the one that arrived with this change — two new file names, one of
  them outside the bundle root — so it is the one that is closed.
generated:
  by: mcp
  at: "2026-09-17T18:41:49.741Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-store.ts
    symbol: KbStore.ensureDeclared
    hash: "sha256:9bbf334daca7c3894834539b56d3be95222816ede9ba9fab3fad14686440b4ff"
    hash_kind: ast
    resolved_at: "2026-09-17T18:42:07.235Z"
    lines: 80
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-pins/layers.ts
    symbol: ensureLocalPinsIgnored
    hash: "sha256:6da23b50aaecc182cabc04bc0d9264b9701234d6c9c5ed3f126a0d95cd1cde60"
    hash_kind: ast
    resolved_at: "2026-09-17T18:42:07.241Z"
    lines: 37
    resolver: tree-sitter
strauss_verify:
  - >-
    a symlinked .gitignore in a base or in <workspace>/.strauss leaves the
    target unchanged
  - >-
    a symlinked .strauss directory is not covered — the record says so, and no
    test claims otherwise
strauss_links:
  - target: risk.symlink-refusal-guards-the-leaf-only
    rel: informs
strauss_status: accepted
---

## Decision

The symlink guard covers the file, not the directory it sits in

## Rationale

Both writers lstat the file they are about to touch and refuse a symlink there. A directory checked in as a symlink — `<workspace>/.strauss`, or a base's own path — is not checked, so `mkdir -p` and the write follow it. Closing that means opening the directory once and working relative to the descriptor, with O_NOFOLLOW on the leaf and appends against the handle: a different I/O shape for the whole store, not a guard in this diff. The leaf case is the one that arrived with this change — two new file names, one of them outside the bundle root — so it is the one that is closed.

## Rejected

A `realpath` containment check before each write: cheap to write and wrong to rely on, since it is a second syscall that resolves separately from the write and the directory can be swapped between them — the same gap as the lstat-then-append race, moved up a level. Declaring the whole class out of scope was also rejected: what the guard does and does not cover is now stated rather than implied.

Informs [risk.symlink-refusal-guards-the-leaf-only](risk.symlink-refusal-guards-the-leaf-only.md).
