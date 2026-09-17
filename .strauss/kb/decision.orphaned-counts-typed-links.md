---
type: decision
title: "doctor's orphaned check counts typed links too, beyond the issue's list"
description: >-
  A record reachable only through strauss_links was reported as an island,
  sending a reader to link something already linked.
sources:
  - id: SAA-821
    resource: >-
      https://linear.app/saason/issue/SAA-821/every-edge-consumer-reads-both-body-citations-and-frontmatter-links
    title: Every edge consumer reads both body citations and frontmatter links
generated:
  by: mcp
  at: "2026-09-17T18:53:14.457Z"
verified:
  - by: "agent:performance"
    at: "2026-09-17T19:11:35.994Z"
    note: >-
      Re-read orphaned: one outboundReferences call per record into a Set, no
      bundle scan inside the loop, where the previous edgeNeighbours(record,
      bundle, 'body-link') filtered the whole bundle per record. Timed on dist:
      the old pass is 0.29/4.67/72.63 ms at n=100/400/1600 (quadratic), the new
      one 0.12/0.36/1.47 ms (linear).
  - by: "agent:correctness"
    at: "2026-09-17T19:12:29.093Z"
    note: >-
      doctor.ts orphaned() reads outboundReferences, so a target reached only
      through strauss_links lands in referenced; the spec case 'a record
      reachable only through a typed link is not orphaned' passes.
  - by: "agent:security"
    at: "2026-09-17T19:13:39.995Z"
    note: >-
      orphaned reads outboundReferences, not edgeNeighbours(body-link);
      self-links are skipped on both halves so a record cannot un-orphan itself.
      Caveat recorded separately: the reader also counts a rel the vocabulary
      rejects.
  - by: "agent:correctness"
    at: "2026-09-17T19:32:02.503Z"
    note: >-
      Re-read at HEAD after the unknown-rel filter landed. orphaned() reads
      outboundReferences, so a typed link un-orphans its target; on a probe
      bundle whose only link carries rel not_a_real_rel, doctor leaves the
      target in orphaned (12 findings on this base, both probe records among
      them) while validate reports link_rel as an error. The caveat in the 19:13
      security note is now resolved in the code.
strauss_anchors:
  - file: packages/strauss-kb/src/doctor.ts
    symbol: orphaned
    hash: "sha256:9fdfb13f970eb8bb0041af35defaa0ac3c435f5baa0a0305508f43cc3c61e2e1"
    hash_kind: ast
    resolved_at: "2026-09-17T18:53:53.352Z"
    lines: 21
    resolver: tree-sitter
strauss_links:
  - target: decision.edge-consumers-read-body-and-frontmatter
    rel: depends_on
strauss_status: accepted
---

## Decision

`orphaned` reads `outboundReferences` rather than body links alone, so a record reached only through a `strauss_links` pointer is not an island. SAA-821 named `doctor`'s `superseded-but-cited`, `reassess`, `sweep` and `validate`; `orphaned` is a fifth consumer it did not name.

## Rationale

The issue's own framing is that the rule is not "doctor should also read frontmatter" but "every consumer of the edge graph reads both". Leaving `orphaned` reading one half would contradict decision.edge-consumers-read-body-and-frontmatter inside the same command, and the false positive is the one a reader acts on wrongly: the repair for an island is to link it, which here means writing a second pointer beside the one that already exists.

## Rejected

Keeping `orphaned` on body links and noting the gap. Rejected: the check would disagree with `superseded-but-cited` two functions away about what a reference is, which is the exact failure the shared reader exists to prevent.

## Impact

The `orphaned` group shrinks on any base that uses typed links without prose sentences. A reviewer expecting the issue's four consumers will find five; the fifth is this record.

Depends on [decision.edge-consumers-read-body-and-frontmatter](decision.edge-consumers-read-body-and-frontmatter.md).

[^SAA-821]: Every edge consumer reads both body citations and frontmatter links
