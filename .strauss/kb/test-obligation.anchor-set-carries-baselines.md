---
type: test-obligation
title: "A reviewed rename keeps its evidence, and forgetting to is refused"
description: >-
  If a set could quietly re-stamp, changed code would stop reporting drift and
  nobody would be asked to read it.
tags:
  - review
generated:
  by: "agent:claude"
  at: "2026-09-17T20:11:47.196Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/anchor-set/anchor-set.spec.ts
    hash: "sha256:fde779bc5a6b0af8e399f9ac986cea3a7f87bd528fbcd96298966649c139ebc1"
    hash_kind: raw
    resolved_at: "2026-09-17T21:27:26.396Z"
    lines: 729
strauss_links:
  - target: contract.anchor-baselines-are-the-records-not-the-callers
    rel: verified_by
strauss_status: open
---

## Obligation

anchor-set over the rename-plus-helper fixture keeps the carried anchor's hash, hash_kind, resolver, resolved_at and lines; leaves the untouched anchor byte-identical; gives the added anchor file and symbol only; and the anchor-resolve that follows still reports drifted until --rebaseline. A set that omits the hashes is refused, as are a hash the record does not hold, an altered stamp, and one hash on two anchors.

## Why it matters

This is the property that separates moving a pointer from accepting the code behind it, and the refusal is what stops the shortcut that defeated the earlier patch interface.

## How to verify

packages/strauss-kb/src/commands/anchor-set/anchor-set.spec.ts — the "a baseline is carried, never minted" block and "the moved pointer reports drift until it is rebaselined".

Verified by [contract.anchor-baselines-are-the-records-not-the-callers](contract.anchor-baselines-are-the-records-not-the-callers.md).
