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
verified:
  - by: "agent:correctness"
    at: "2026-09-17T18:11:31.151Z"
    note: >-
      Both named tests exist and pass: 'keeps the replaced anchor's baseline and
      leaves the addition unstamped' and 'the moved pointer reports drift until
      it is rebaselined' (drifted/match/stamped before rebaseline, all match
      after).
strauss_anchors:
  - file: packages/strauss-kb/src/commands/anchor-update/anchor-update.spec.ts
    hash: "sha256:788cf417c9886e1c6c0919a27de4dbaba7a8f7647141da0a762d376ad0725ad2"
    hash_kind: raw
    resolved_at: "2026-09-17T18:22:13.013Z"
    lines: 829
strauss_status: open
---

## Obligation

anchor-update over the rename-plus-helper fixture keeps the replaced anchor's hash, hash_kind, resolver, resolved_at and lines; leaves the untouched anchor byte-identical; gives the added anchor file and symbol only; and the anchor-resolve that follows still reports drifted until --rebaseline.

## Why it matters

This is the one property that separates moving a pointer from accepting the code behind it.

## How to verify

packages/strauss-kb/src/commands/anchor-update/anchor-update.spec.ts — "keeps the replaced anchor's baseline and leaves the addition unstamped" and "the moved pointer reports drift until it is rebaselined".
