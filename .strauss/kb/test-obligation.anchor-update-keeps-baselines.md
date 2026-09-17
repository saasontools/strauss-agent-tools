---
type: test-obligation
title: A reviewed pointer move keeps every baseline it did not touch
description: >-
  If a replacement quietly carried a fresh hash, changed code would stop
  reporting drift and nobody would be asked to read it.
tags:
  - review
generated:
  by: "agent:claude"
  at: "2026-09-17T17:50:38.602Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/anchor-update/anchor-update.spec.ts
    hash: "sha256:988407164a039ea50cb71592b2e40696573180c1bfa3c55f39ff16786a87a288"
    hash_kind: raw
    resolved_at: "2026-09-17T17:59:47.237Z"
    lines: 737
strauss_status: open
---

## Obligation

anchor-update over the rename-plus-helper fixture keeps the replaced anchor's hash, hash_kind, resolver, resolved_at and lines; leaves the untouched anchor byte-identical; gives the added anchor file and symbol only; and the anchor-resolve that follows still reports drifted until --rebaseline.

## Why it matters

This is the one property that separates moving a pointer from accepting the code behind it.

## How to verify

packages/strauss-kb/src/commands/anchor-update/anchor-update.spec.ts — "keeps the replaced anchor's baseline and leaves the addition unstamped" and "the moved pointer reports drift until it is rebaselined".
