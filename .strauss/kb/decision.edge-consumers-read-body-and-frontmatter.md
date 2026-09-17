---
type: decision
title: >-
  Five edge kinds; every edge consumer reads both body citations and
  strauss_links
description: >-
  doctor, reassess, sweep and validate each read one half of the edge graph, so
  a frontmatter-only citation escapes a staleness warning and a body-only
  citation gets its target deleted.
sources:
  - id: SAA-821
    resource: >-
      https://linear.app/saason/issue/SAA-821/every-edge-consumer-reads-both-body-citations-and-frontmatter-links
    title: Every edge consumer reads both body citations and frontmatter links
generated:
  by: mcp
  at: "2026-09-17T18:32:23.034Z"
verified:
  - by: "agent:prose"
    at: "2026-09-17T19:08:42.269Z"
    note: >-
      Prose check only: bodyLinkTargets in kb-edges.ts is the sole body-citation
      parser — the BODY_LINK_TARGET regex has no second use, and validate.ts,
      sweep.ts, outbound.ts and edgeNeighbours all call it.
  - by: "agent:performance"
    at: "2026-09-17T19:11:35.778Z"
    note: >-
      Read the shared readers and timed them on the built dist. One
      body-citation parser, and the consumers moved off edgeNeighbours'
      per-record bundle.filter: at n=1600 the old body-link neighbour pass is
      72.6 ms against 1.5 ms for outboundReferences, and doctor's two uses of it
      drop from quadratic to linear. Bounded too: replacementChain's seen set
      stops on a cycle, and the BODY_LINK_TARGET regex stays under 0.2 ms on 32
      KB of pathological unterminated-link input.
  - by: "agent:correctness"
    at: "2026-09-17T19:12:21.918Z"
    note: >-
      Read bodyLinkTargets in kb-edges.ts and its four consumers: sweep
      holderIndex, validate's body_link warning, doctor via
      outboundReferences/staleReferences, and reassess's referenceReview. One
      parser, no second regex; 897 package tests and tsc pass.
  - by: "agent:security"
    at: "2026-09-17T19:13:39.852Z"
    note: >-
      Read all five consumers: bodyLinkTargets in kb-edges.ts is the only
      body-citation regex; sweep's holderIndex, validate's body_link warning,
      doctor's supersededButCited and orphaned, and reassess's referenceReview
      all read both halves. A missing target stays a warning (validate exit 0)
      and a reason to keep (sweep skipped). KB_EDGE_KINDS has the five kinds
      named.
  - by: "agent:correctness"
    at: "2026-09-17T19:32:02.726Z"
    note: >-
      Re-read all four named consumers at HEAD. bodyLinkTargets is the only
      matchAll over BODY_LINK_TARGET in src/; doctor, sweep, validate and
      reassess reach the body half through it, and outboundReferences merges it
      with strauss_links, skipping a rel outside KB_LINK_RELS. Missing target
      stays a warning in validate and a hold in sweep, never an error: validate
      exits 0 on a body_link warning alone. Two caveats recorded separately - a
      fenced example link counts as a citation, and the untraversable-rel
      invariant does not reach inboundIndex.
  - by: "agent:security"
    at: "2026-09-17T19:34:06.683Z"
    note: >-
      Re-read at HEAD, after the isKbLinkRel filter landed in
      outboundReferences. The rel half of risk.unknown-rel-traversed-and-echoed
      is closed: an unknown rel no longer rescues a target from orphaned and no
      rel outside the eight reaches a note. That risk's Mitigation section still
      reads 'None in the diff' and now misstates the code; the author or a human
      settles it.
strauss_anchors:
  - file: packages/strauss-kb/src/kb-edges.ts
    symbol: KB_EDGE_KINDS
    hash: "sha256:0648248fcc514e5b045b23b469c35de373e01569dcba06453f52b1d99505a63c"
    hash_kind: raw
    resolved_at: "2026-09-17T18:53:51.266Z"
    lines: 7
    resolver: regex
  - file: packages/strauss-kb/src/kb-edges.ts
    symbol: bodyLinkTargets
    hash: "sha256:fb2fe27fae159f26a5412004050446bf10f0cd24e6f0930bbb5aa2688848adff"
    hash_kind: ast
    resolved_at: "2026-09-17T19:38:27.464Z"
    lines: 8
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-references/outbound.ts
    symbol: outboundReferences
    hash: "sha256:3adae82cd75f5612c9a9826479dcb47361d4231822bdb7f20c41591346664ba2"
    hash_kind: ast
    resolved_at: "2026-09-17T19:20:09.426Z"
    lines: 30
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-references/stale.ts
    symbol: staleReferences
    hash: "sha256:8bb019e7541e4d81b7b546d3c1bec25bf6d027b725a1074584bdac31eea86171"
    hash_kind: ast
    resolved_at: "2026-09-17T18:55:57.110Z"
    lines: 9
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-references/model.ts
    symbol: KB_REFERENCE_ORIGINS
    hash: "sha256:0a35cfed1e27634042e7affa2a59d9aeee503935c7cccb63e5bd8ec3ced7085f"
    hash_kind: raw
    resolved_at: "2026-09-17T18:57:20.224Z"
    lines: 4
    resolver: regex
  - file: packages/strauss-kb/src/kb-references/index.ts
    symbol: KbStaleReference
    hash: "sha256:0c932a2eb8a5b53d4dd36b43e5f863823eab166fb83c26492a9993084cfda916"
    hash_kind: raw
    resolved_at: "2026-09-17T18:58:04.408Z"
    lines: 2
    resolver: regex
  - file: packages/strauss-kb/src/validate.ts
    symbol: validateBundle
    hash: "sha256:63c69212ed7ce08687eadb436901301870ba4ffbada9656be72a1fb008d7d8e4"
    hash_kind: ast
    resolved_at: "2026-09-17T18:55:57.113Z"
    lines: 169
    resolver: tree-sitter
  - file: packages/strauss-kb/src/index.ts
    symbol: KbStaleReference
    hash: "sha256:41fe4e02a772aa6437ffe8908f32f47f8d73a9f1220a03b6b74b4ec047e5df44"
    hash_kind: raw
    resolved_at: "2026-09-17T18:58:04.411Z"
    lines: 2
    resolver: regex
  - file: packages/strauss-kb/src/drift/index.ts
    symbol: KbPacketReferences
    hash: "sha256:8d4e212d99442619a9a8b72c31b0af1f17f8ddf837fa9d3774504966c48b61aa"
    hash_kind: raw
    resolved_at: "2026-09-17T18:57:20.229Z"
    lines: 7
    resolver: regex
strauss_links:
  - target: risk.edge-kind-enumeration-stale
    rel: informs
strauss_status: accepted
strauss_supersedes:
  - decision.kb-edges-fold-related-into-body-link
---

## Decision

KbEdgeKind is body-link | typed-link | supersession | anchor | source — five kinds. Related edges remain body links: compose.ts renders relatedConceptIds as a `Relates to` sentence carrying a markdown link to the target's file, so in stored form a related edge IS a body link and a sixth `related` kind would count the same markdown twice.

Every consumer of the edge graph reads both halves — a record's markdown body citations and its `strauss_links` frontmatter. That is doctor's `superseded-but-cited`, single-record `reassess`, `sweep`'s hold guard, and `validate`. One body-citation parser, exported from kb-edges.ts, serves all of them.

A missing target is still not an error. It is a warning in `validate` and a reason to keep in `sweep`; nothing refuses a write or fails a build over it.

## Rationale

The superseded decision said broken body links are legal per compose.ts doctrine, never an error, and that outbound walks skip missing targets silently. That reading is what let `sweep` delete a record cited only from a surviving record's body: measured on the SAA-810 PR base, 27 deletions left 5 dangling body links across 3 surviving decisions, and `validate` returned []. `--dry-run` gave no protection — same index, same answer. Silence about a missing target is right for a walk, which has nothing to say about a record it cannot reach; it is wrong for a consumer that is about to delete one or to certify that nothing is broken.

The two directions are asymmetric on purpose. Reading both halves makes `sweep` keep more and `validate` and `doctor` say more; neither makes anything fail that passed before.

The superseded record also enumerated four kinds; `typed-link` was added afterwards, which is risk.edge-kind-enumeration-stale.

## Rejected

Leaving `sweep` as the doctrine's correct consumer and treating the review plugin's `store.dangling-link` as the defect. Rejected: the check is the only thing that caught real data loss, and a doctrine whose consequence is deleting cited records is the thing to replace.

Also rejected: making a dangling body link a `validate` error. A record is routinely written before the one it points at, so an error would fail bases that are merely mid-write.

## Impact

Anyone adding an edge consumer reads both halves or states why one is enough. `bodyLinkTargets` in kb-edges.ts is the single body-citation parser — a second regex over the same markdown is the defect this decision exists to prevent. `impact` semantics are untouched: contextual `related_to` stays out of causal traversal.

Informs [risk.edge-kind-enumeration-stale](risk.edge-kind-enumeration-stale.md).

[^SAA-821]: Every edge consumer reads both body citations and frontmatter links
