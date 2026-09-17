---
type: decision
title: >-
  Reference findings ride in the packet, and a packet with no open anchor leans
  review
description: >-
  A reader who gets "nothing to reassess" for a record resting on a replaced
  decision stops looking.
sources:
  - id: SAA-821
    resource: >-
      https://linear.app/saason/issue/SAA-821/every-edge-consumer-reads-both-body-citations-and-frontmatter-links
    title: Every edge consumer reads both body citations and frontmatter links
generated:
  by: mcp
  at: "2026-09-17T18:53:43.195Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/drift/packet.ts
    symbol: reassessPacket
    hash: "sha256:13219117833e9e38720039a90677279fd06d948fafcaecc1813dc403b6be3839"
    hash_kind: ast
    resolved_at: "2026-09-17T18:54:01.042Z"
    lines: 76
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/reassess.ts
    symbol: referenceReview
    hash: "sha256:7a029e72a808a733753dec2b203d86e0aee772c9d3031f38a2fc32549cd2f056"
    hash_kind: ast
    resolved_at: "2026-09-17T18:54:01.045Z"
    lines: 20
    resolver: tree-sitter
strauss_links:
  - target: decision.edge-consumers-read-body-and-frontmatter
    rel: depends_on
strauss_status: accepted
---

## Decision

`KbReassessPacket` gains `references: { outgoing, incoming }`, and `reassessPacket` returns a packet when there are open anchors **or** references. With no open anchor the packet's `default` is `review` and its note names the references rather than the code. `doctor --drifted` does not pass references: its packets answer the drift question, and the `superseded-but-cited` group already answers the other one.

## Rationale

The packet is what a reader reads; a second field beside it on `KbReassessResult` would make the renderer and every client choose between two places for one reading. The type-based lean (`presumed-invalidated` for a `fact`, `rationale-may-survive` for a `decision`) is a lean about changed evidence, so applying it when nothing moved would presume a claim invalid on evidence that did not move. `KbReassessDefault` stays a closed three-member union and only the note varies.

## Rejected

A fourth `KbReassessDefault` member for the references-only case — every consumer switching on the union would have to grow a branch for a lean that is just `review`. Also rejected: keeping `packet` strictly about drift and adding `references` to the command result, which leaves the renderer printing "nothing to reassess" above a section that says otherwise.

## Impact

A client reading `packet.anchors.length === 0` must not infer "no packet". `doctor --drifted` packets carry empty reference arrays by design; anyone who wants them there must also decide what to do about the duplicate with `superseded-but-cited`.

Depends on [decision.edge-consumers-read-body-and-frontmatter](decision.edge-consumers-read-body-and-frontmatter.md).

[^SAA-821]: Every edge consumer reads both body citations and frontmatter links
