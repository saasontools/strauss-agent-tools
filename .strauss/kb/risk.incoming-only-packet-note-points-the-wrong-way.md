---
type: risk
title: >-
  A packet raised by incoming references tells the reader to re-read them
  against what replaced them
description: >-
  The one packet the change exists for hands its reader an instruction that
  inverts the direction of the finding.
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-17T19:31:09.137Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/drift/packet.ts
    symbol: reassessPacket
    hash: "sha256:396e12e183fd9246d6b37a8332ada741e34fba5db4ad022ca09ccb1796d1a27b"
    hash_kind: ast
    resolved_at: "2026-09-17T19:38:28.173Z"
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

reassessPacket picks one note for every packet with no open anchor: `<...>; re-read the references below against what replaced them`. It is right for `outgoing` — this record leans on something that was replaced — and backwards for `incoming`, where the records below were not replaced and the record being reassessed is the one that was. Reproduced against the built CLI: a superseded `decision.retention` with one live `related_to` from `risk.environment-override` prints `## Still pointing here (1)` followed by `Default: review — no anchor drift; re-read the references below against what replaced them.`

## Why it matters

The note is the packet's whole instruction once `## Anchors (0)` is empty, and this is the packet decision.reassess-references-ride-in-the-packet names as the case the change was added for. An agent following it looks for a replacement for `risk.environment-override`, which has none, instead of re-reading that risk against `decision.retention-seven-days`. The same sentence was already repaired once for the anchors half, as risk.reassess-note-denies-the-drift-it-just-rebaselined.

## Mitigation

None in the diff. `references.outgoing.length` and `references.incoming.length` are both in hand where the note is chosen, so the second half can be worded per side: outgoing re-reads against what replaced the target, incoming re-reads each referrer against what replaced this record.

## Verification

Reassess a superseded record with a live inbound reference and no drift: the note names the referrers as the thing to re-read against this record's replacement, not against replacements of their own.

Informs [decision.reassess-references-ride-in-the-packet](decision.reassess-references-ride-in-the-packet.md).
