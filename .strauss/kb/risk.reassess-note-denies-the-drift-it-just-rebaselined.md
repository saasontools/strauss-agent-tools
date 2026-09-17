---
type: risk
title: >-
  A packet whose anchors all classified moved says "no anchor drift" above the
  rebaseline it just performed
description: >-
  The reader is told the code did not move on the same screen that says where it
  moved to.
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-17T19:11:41.449Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/drift/packet.ts
    symbol: reassessPacket
    hash: "sha256:376a19d7d62f487164d6489e664e2d5241661eae52803d18127e64cb9bab8869"
    hash_kind: ast
    resolved_at: "2026-09-17T19:20:40.640Z"
    lines: 84
    resolver: tree-sitter
strauss_links:
  - target: decision.reassess-references-ride-in-the-packet
    rel: informs
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

reassessPacket picks the references-only note whenever `open.length === 0`, but `open` is the anchors left after classification, not the anchors that drifted. A record whose every drifted anchor classified `moved` or `cosmetic` and that also holds a stale reference now gets a packet, and its default note is "no anchor drift; re-read the references below against what replaced them". Reproduced against the built CLI: a record anchored at src/orders.ts:totals, the file git-mv'd to src/billing.ts, plus one strauss_links entry at a superseded decision, prints `rebaselined: src/orders.ts:totals -> src/billing.ts:totals (same code, new address)`, `## Anchors (0)`, and `Default: review - no anchor drift; ...`.

## Why it matters

`moved` is the one class reassess settles by writing to the base. A note that denies the drift is the note printed beside a write the reader is being asked to trust, and it is the only sentence in the packet that speaks about the anchors at all once `## Anchors` is empty.

## Mitigation

None in the diff. The note is chosen off `open.length`; the condition it means is `entries.every(entry => entry.state === "match")` — no drift at all — which the command already computes as `drifted`. Either pass it, or word the note as "nothing left open on the anchors".

## Verification

Anchor a record at a symbol, move the file in a commit, add a strauss_links entry at a superseded record, and run `strauss-kb reassess <id>`: the rebaselined line and the note disagree.

Informs [decision.reassess-references-ride-in-the-packet](decision.reassess-references-ride-in-the-packet.md).
