---
type: test-obligation
title: >-
  A declaration write stays in its directory, and a rule left unwritten is
  reported
description: >-
  Both writers append a constant line to a path the repository names, and one of
  them had no way to say it had not. A symlink at that path sent the line
  outside the base; a committed negation stopped the personal-pins rule with no
  signal at all.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-17T18:21:10.354Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-store.ts
    symbol: KbStore.ensureDeclared
    hash: "sha256:9bbf334daca7c3894834539b56d3be95222816ede9ba9fab3fad14686440b4ff"
    hash_kind: ast
    resolved_at: "2026-09-17T18:42:13.455Z"
    lines: 80
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-pins/layers.ts
    symbol: ensureLocalPinsIgnored
    hash: "sha256:6da23b50aaecc182cabc04bc0d9264b9701234d6c9c5ed3f126a0d95cd1cde60"
    hash_kind: ast
    resolved_at: "2026-09-17T18:22:04.882Z"
    lines: 37
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-pins/pin.ts
    symbol: pinBase
    hash: "sha256:8e2d02b7a52f257bbff3d79b39038e93a2b347a7b1140feee34a10c1be161b9e"
    hash_kind: ast
    resolved_at: "2026-09-17T18:22:04.884Z"
    lines: 75
    resolver: tree-sitter
strauss_links:
  - target: risk.declaration-append-follows-a-symlink-out-of-the-base
    rel: satisfies
  - target: risk.committed-negation-disables-the-personal-pins-rule
    rel: satisfies
  - target: risk.kb-local-pins-ignore-fails-silently
    rel: satisfies
strauss_status: open
---

## Obligation

kb-store.spec.ts: a symlinked `.gitignore` in a base leaves the linked file byte-identical, warns `refused-symlink`, and the write still succeeds.

kb-pins.spec.ts: pinning `--local` into a workspace whose `.strauss/.gitignore` holds `!kb-pins.local.json` leaves the file untouched and returns a warning naming the suppressed pattern; a symlinked `.strauss/.gitignore` does the same and leaves its target unchanged.

## Why it matters

The repository picks the file, not the bytes, so the symlink case is corruption and noise rather than execution — but it reaches outside the bundle root, which nothing else in the store does. The negation is deliberate behaviour; doing it silently was the defect, and the contributor whose personal manifest is now trackable is the one who needs to hear it.

## How to verify

pnpm vitest run src/kb-store.spec.ts src/kb-pins.spec.ts

Satisfies [risk.declaration-append-follows-a-symlink-out-of-the-base](risk.declaration-append-follows-a-symlink-out-of-the-base.md).

Satisfies [risk.committed-negation-disables-the-personal-pins-rule](risk.committed-negation-disables-the-personal-pins-rule.md).

Satisfies [risk.kb-local-pins-ignore-fails-silently](risk.kb-local-pins-ignore-fails-silently.md).
