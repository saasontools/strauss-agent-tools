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
verified:
  - by: "agent:correctness"
    at: "2026-09-17T19:31:49.889Z"
    note: >-
      Both halves cover. drift.spec.ts 'a rebaselined move plus a stale
      reference does not deny the drift' asserts defaultNote contains 'nothing
      left open on the anchors' and not 'no anchor drift'; references.spec.ts 'a
      references-only packet still carries the record's dependants' asserts
      packet.impact names the dependant at depth 1 with anchors empty. Ran both:
      71 pass, 0 fail.
  - by: "agent:correctness"
    at: "2026-09-17T21:51:12.599Z"
    note: >-
      Read reassessPacket and reassessCommand at HEAD: the note branches on
      entries.some(state !== 'match') so a record whose anchors all classified
      moved says 'nothing left open on the anchors', and dependants = impact(id,
      bundle) is unconditional once a packet is emitted. drift.spec.ts and
      references.spec.ts both pass in a full run (917 tests, 0 failures).
strauss_anchors:
  - file: packages/strauss-kb/src/drift/packet.ts
    symbol: reassessPacket
    hash: "sha256:396e12e183fd9246d6b37a8332ada741e34fba5db4ad022ca09ccb1796d1a27b"
    hash_kind: ast
    resolved_at: "2026-09-17T19:38:27.691Z"
    lines: 84
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/reassess.ts
    symbol: reassessCommand
    hash: "sha256:c1f423f270aa03c811a019756a1e60b06d24e13501504b2828e467687d863418"
    hash_kind: raw
    resolved_at: "2026-09-18T15:40:45.769Z"
    lines: 131
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
