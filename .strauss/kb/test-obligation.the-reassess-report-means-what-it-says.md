---
type: test-obligation
title: >-
  The packet's note points at the right replacement, and a record's title fills
  a row rather than forging one
description: >-
  The note is the packet's whole instruction once the anchor list is empty, and
  the rows under a header that states a count must be the rows the count named.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-17T19:38:04.175Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/drift/packet.ts
    symbol: referenceNote
    hash: "sha256:962d47be32d7957e860dbfec5d04e90f2928fcac5226dc86a100499ea7506c93"
    hash_kind: ast
    resolved_at: "2026-09-17T19:38:27.245Z"
    lines: 8
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/reassess.ts
    symbol: oneLine
    hash: "sha256:d9c6e375425ba58eec1a860f04cb5f7f44b2ef4c147aa797334c40f5bf8c9c40"
    hash_kind: ast
    resolved_at: "2026-09-17T19:38:27.251Z"
    lines: 3
    resolver: tree-sitter
strauss_links:
  - target: risk.incoming-only-packet-note-points-the-wrong-way
    rel: satisfies
  - target: risk.record-title-forges-a-line-in-a-prose-report
    rel: satisfies
strauss_status: open
---

## Obligation

`referenceNote` words the second half of the note per side: an `outgoing` reference is re-read against what replaced the target, an `incoming` one against what replaced the record being reassessed, and a packet holding both says both. Every place the renderer quotes another record's `title` — the packet header, `## Still pointing here`, `## Impact` — passes it through `oneLine` first, so control characters and newlines cannot open a row.

## Why it matters

An agent following the wrong half of the note hunts for a replacement that does not exist instead of re-reading the referrer against the one that does. A title is another record's text; in a report whose headers state a count, a newline in one forges a row rather than filling one.

## How to verify

`references.spec.ts` — reassessing a superseded record with a live inbound reference and no drift gives the note naming what replaced _this_ record, and never "against what replaced them". With that referrer's title carrying an escape and a newline, `## Still pointing here (1)` is followed by exactly one row, the output holds no escape byte, and no line begins with the forged text.

Satisfies [risk.incoming-only-packet-note-points-the-wrong-way](risk.incoming-only-packet-note-points-the-wrong-way.md).

Satisfies [risk.record-title-forges-a-line-in-a-prose-report](risk.record-title-forges-a-line-in-a-prose-report.md).
