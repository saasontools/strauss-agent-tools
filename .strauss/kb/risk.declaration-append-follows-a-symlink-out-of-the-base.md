---
type: risk
title: A symlinked .gitignore takes the append outside the base
description: A path from repository data reaches a file the store does not own.
tags:
  - review
  - "review:security"
generated:
  by: "agent:security"
  at: "2026-09-17T18:07:16.731Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-store.ts
    symbol: KbStore.ensureDeclared
    hash: "sha256:9bbf334daca7c3894834539b56d3be95222816ede9ba9fab3fad14686440b4ff"
    hash_kind: ast
    resolved_at: "2026-09-17T18:42:10.518Z"
    lines: 80
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-pins/layers.ts
    symbol: ensureLocalPinsIgnored
    hash: "sha256:6da23b50aaecc182cabc04bc0d9264b9701234d6c9c5ed3f126a0d95cd1cde60"
    hash_kind: ast
    resolved_at: "2026-09-17T18:22:06.212Z"
    lines: 37
    resolver: tree-sitter
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: medium
---

## Risk

ensureDeclared reads and appends by name, with no lstat and no O_NOFOLLOW. A repository may check in `.strauss/kb/.gitignore` as a symlink; readFile then reports the target's contents and appendFile writes into the target. Confirmed on this platform: appending through a symlink left `/.index.sqlite*` in the linked file, outside the base. The same holds for the new `<workspace>/.strauss/.gitignore`.

## Why it matters

The attacker picks the file, not the bytes: the appended line is a constant, so this adds a line to something like a shell profile or a git config rather than injecting content. Corruption and noise, not execution. The class predates this change on .gitattributes; the diff extends it to two more names, one of them outside the bundle root.

## Mitigation

None in the diff. An lstat before the write, refusing a symlink, would confine both writers to the directory that owns the file.

## Verification

A spec where the base's .gitignore is a symlink to a file outside the base leaves that file unchanged.
