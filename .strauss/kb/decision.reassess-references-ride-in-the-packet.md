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
verified:
  - by: "agent:performance"
    at: "2026-09-17T19:12:08.902Z"
    note: >-
      Read the new order in reassessCommand.run: adjudicate(bundle,bundle) and
      referenceReview now run before the drift check, so the nothing-to-do path
      pays an adjudicate it used to skip. Timed on dist: adjudicate is 0.37 ms
      at n=100 and 8.4-13.5 ms at n=1600 depending on the superseded fraction,
      against store.list at 5.5-47.0 ms and a one-record detectDrift at 60 ms on
      this base. The packet gate reads references without a second walk, and
      impact is now skipped when nothing drifted.
  - by: "agent:correctness"
    at: "2026-09-17T19:12:29.222Z"
    note: >-
      packet.references.{outgoing,incoming} present, reassessPacket emits on
      references with no open anchor, default stays the three-member union and
      leans review, doctor --drifted passes no references. Checked against the
      built CLI. The impact set it drops in that path is
      risk.references-only-packet-reports-no-dependants.
  - by: "agent:security"
    at: "2026-09-17T19:13:40.140Z"
    note: >-
      packet.references carries outgoing/incoming; reassessPacket returns a
      packet on references alone with default 'review'; doctor's command passes
      impact and standing but no references. Freeze guard still gated on
      moves.length, so the no-drift path writes nothing.
strauss_anchors:
  - file: packages/strauss-kb/src/drift/packet.ts
    symbol: reassessPacket
    hash: "sha256:376a19d7d62f487164d6489e664e2d5241661eae52803d18127e64cb9bab8869"
    hash_kind: ast
    resolved_at: "2026-09-17T19:20:09.869Z"
    lines: 84
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
