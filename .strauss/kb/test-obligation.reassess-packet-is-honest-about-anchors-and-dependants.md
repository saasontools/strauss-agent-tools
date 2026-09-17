---
type: test-obligation
title: >-
  A reassess packet never denies drift it settled, and always carries the
  dependants
description: >-
  The note is the only sentence left speaking about the anchors once the anchor
  list is empty, and it prints beside a write the reader is asked to trust.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-17T19:19:33.197Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/drift/packet.ts
    symbol: reassessPacket
    hash: "sha256:376a19d7d62f487164d6489e664e2d5241661eae52803d18127e64cb9bab8869"
    hash_kind: ast
    resolved_at: "2026-09-17T19:20:08.744Z"
    lines: 84
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/reassess.ts
    symbol: reassessCommand
    hash: "sha256:c2ecd7e1f5a759d13d151d3b02ad00c6d25d264615fc9951b839c1d743102097"
    hash_kind: raw
    resolved_at: "2026-09-17T19:20:08.751Z"
    lines: 134
    resolver: regex
strauss_links:
  - target: risk.reassess-note-denies-the-drift-it-just-rebaselined
    rel: satisfies
  - target: risk.references-only-packet-reports-no-dependants
    rel: satisfies
strauss_status: open
---

## Obligation

The references-only note is chosen off whether anything drifted at all, not off what classification left open: a record whose every drifted anchor classified `moved` says "nothing left open on the anchors", and only a record with no drift says "no anchor drift". Every packet the command emits carries the record's `impact` set, whichever half raised it — `incoming` is one hop and contextual, so a dependant further down the causal chain is in `impact` or nowhere.

## Why it matters

`moved` is the one class `reassess` settles by writing to the base. A packet raised by references alone is the case the change exists for, and a client cannot tell an uncomputed dependant set from an empty one.

## How to verify

`drift.spec.ts` — anchor a record at a symbol, `git mv` the file, add a frontmatter-only link at a superseded decision: the run rebaselines, prints no anchors, and its note does not contain "no anchor drift". `references.spec.ts` — reassess a superseded decision with one `depends_on` dependant and no anchors: `packet.impact` names the dependant at depth 1.

Satisfies [risk.reassess-note-denies-the-drift-it-just-rebaselined](risk.reassess-note-denies-the-drift-it-just-rebaselined.md).

Satisfies [risk.references-only-packet-reports-no-dependants](risk.references-only-packet-reports-no-dependants.md).
