---
type: risk
title: "The symlink refusal checks the last path segment, and not atomically"
description: >-
  A symlinked parent directory still takes both writers outside the workspace,
  unwarned.
tags:
  - review
  - "review:security"
generated:
  by: "agent:security"
  at: "2026-09-17T18:34:12.139Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-pins/layers.ts
    symbol: ensureLocalPinsIgnored
    hash: "sha256:6da23b50aaecc182cabc04bc0d9264b9701234d6c9c5ed3f126a0d95cd1cde60"
    hash_kind: ast
    resolved_at: "2026-09-17T18:35:07.088Z"
    lines: 37
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-store.ts
    symbol: KbStore.ensureDeclared
    hash: "sha256:9bbf334daca7c3894834539b56d3be95222816ede9ba9fab3fad14686440b4ff"
    hash_kind: ast
    resolved_at: "2026-09-17T18:42:13.208Z"
    lines: 80
    resolver: tree-sitter
strauss_links:
  - target: risk.declaration-append-follows-a-symlink-out-of-the-base
    rel: informs
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

Both writers lstat the file they are about to touch and refuse a symlink there (kb-store.ts:1160-1168, layers.ts:110-115). Neither checks the directory. Reproduced: with `<workspace>/.strauss` checked in as a symlink to a directory outside the workspace, `pinBase(--local)` runs `mkdir -p` through the link and writes both `.gitignore` and `kb-pins.local.json` into the link target, returning no warning. A base whose own path is reached through a symlinked directory is the same case. Separately, lstat and the later appendFile are two calls: a writer that swaps the file for a symlink between them still gets the append.

## Why it matters

The attacker picks the file, not the bytes — an ignore line and a pins manifest, so corruption and noise rather than execution — but the personal manifest carries absolute paths to one contributor's bases, and it lands somewhere nobody looks. flow.kb-declaration-files-ensured-on-every-mutation reads as though the refusal confines the write to the directory that owns the file; it confines the leaf.

## Mitigation

None in the diff, and the leaf case is the one the tests pin. Closing both would mean opening the directory once and working relative to that descriptor (`open` with O_NOFOLLOW on the leaf, appends against the handle), which is a larger change than this diff took on.

## Verification

Pinning `--local` into a workspace whose `.strauss` is a symlink writes nothing outside the workspace, or says that it did not write.

Informs [risk.declaration-append-follows-a-symlink-out-of-the-base](risk.declaration-append-follows-a-symlink-out-of-the-base.md).
