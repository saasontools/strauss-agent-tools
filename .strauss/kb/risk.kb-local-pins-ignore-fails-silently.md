---
type: risk
title: "A failed workspace ignore write leaves personal pins trackable, silently"
description: >-
  ensureLocalPinsIgnored swallows every error, so a read-only or otherwise
  unwritable .strauss directory leaves kb-pins.local.json un-ignored and nobody
  is told; the next `git add -A` commits one developer's personal pins to the
  team's branch.
tags:
  - review
sources:
  - id: SAA-815
    resource: >-
      https://linear.app/saason/issue/SAA-815/create-scoped-git-ignore-rules-when-initializing-a-strauss-kb
    title: Create scoped Git ignore rules when initializing a Strauss KB
generated:
  by: mcp
  at: "2026-09-17T17:47:55.123Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-pins/layers.ts
    symbol: ensureLocalPinsIgnored
    hash: "sha256:213a51325c23bb5848c72afd47ea961336884a41eb319996565996ac67f4d699"
    hash_kind: ast
    resolved_at: "2026-09-17T17:52:30.129Z"
    lines: 26
    resolver: tree-sitter
strauss_links:
  - target: decision.kb-ignore-anchored-per-location
    rel: related_to
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: medium
---

## Why it matters

The pins layer has no logger — the store's KbLogger stops at KbStore — so unlike KbStore.ensureGitignore, which warns with operation kb.gitignore.ensure, this path cannot even warn. The blast radius is small (a committed personal manifest, removable) but the failure is invisible.

## Mitigation

Either plumb a logger into the pins layer and warn as the store does, or have pinBase carry the miss in its existing `warning` field. Left open: both widen the pin surface, and the manifest write itself fails loudly under the same conditions, which is the signal a user actually sees.

## Verification

Pinning with --local into a workspace whose .strauss is read-only reports something about the missing ignore rule.

Relates to [decision.kb-ignore-anchored-per-location](decision.kb-ignore-anchored-per-location.md).

[^SAA-815]: Create scoped Git ignore rules when initializing a Strauss KB
