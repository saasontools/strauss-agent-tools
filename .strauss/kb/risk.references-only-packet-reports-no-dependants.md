---
type: risk
title: >-
  A packet raised by references alone carries impact: [], which reads as
  "nothing depends on this"
description: >-
  The reader settling a superseded record is shown an empty dependants list that
  was never computed.
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-17T19:11:54.971Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/reassess.ts
    symbol: reassessCommand
    hash: "sha256:c1f423f270aa03c811a019756a1e60b06d24e13501504b2828e467687d863418"
    hash_kind: raw
    resolved_at: "2026-09-18T15:40:39.841Z"
    lines: 131
    resolver: regex
  - file: packages/strauss-kb/src/drift/packet.ts
    symbol: reassessPacket
    hash: "sha256:396e12e183fd9246d6b37a8332ada741e34fba5db4ad022ca09ccb1796d1a27b"
    hash_kind: ast
    resolved_at: "2026-09-17T19:38:29.329Z"
    lines: 84
    resolver: tree-sitter
strauss_links:
  - target: decision.reassess-references-ride-in-the-packet
    rel: informs
strauss_status: open
strauss_materiality: important
strauss_confidence: high
---

## Risk

reassess now computes `impact` only when the record drifted (`const impact = drifted ? await store.impact(path, id) : undefined`), and the packet fills the missing value with `[]` (`impact: (options.impact?.impacted ?? [])`). Every packet raised by references alone therefore reports no dependants and `impactTruncated: false`. Reproduced against the built CLI: for a superseded decision with one `depends_on` dependant, `strauss-kb impact decision.retention` returns that dependant at depth 1, while `strauss-kb reassess decision.retention --json` returns `packet.impact: []` on the same base.

## Why it matters

This is exactly the packet the change was added for - the superseded record whose readers have to be found - and `incoming` is one hop and contextual, so a dependant two hops down the causal chain appears in neither field. cli-reference.md still lists the impact set as part of what reassess hands the reader, so a client cannot tell an uncomputed set from an empty one.

## Mitigation

None in the diff, and no record states the omission: decision.reassess-references-ride-in-the-packet describes what references add and says nothing about impact being dropped. Either compute impact whenever a packet is emitted, or make the packet distinguish "not computed" from "empty".

## Verification

On a base where `strauss-kb impact <superseded-id>` lists at least one record, `strauss-kb reassess <superseded-id> --json` returns a packet with a non-empty `impact`.

Informs [decision.reassess-references-ride-in-the-packet](decision.reassess-references-ride-in-the-packet.md).
