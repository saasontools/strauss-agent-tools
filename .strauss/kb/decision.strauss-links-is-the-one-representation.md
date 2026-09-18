---
type: decision
title: strauss_links is the edge; a markdown link in the body is its rendering
description: >-
  Two representations of one edge cost data: sweep read frontmatter and deleted
  records cited in prose, doctor read prose and missed a related_to at a
  superseded target.
sources:
  - id: SAA-821
    resource: >-
      https://linear.app/saason/issue/SAA-821/every-edge-consumer-reads-both-body-citations-and-frontmatter-links
    title: Every edge consumer reads both body citations and frontmatter links
  - id: SAA-824
    resource: "https://linear.app/saason/issue/SAA-824"
    title: >-
      One representation for a related edge: maintain strauss_links from the
      body at write time
generated:
  by: mcp
  at: "2026-09-17T21:31:01.797Z"
verified:
  - by: "agent:performance"
    at: "2026-09-17T21:49:14.893Z"
    note: >-
      Performance half: the body parser left the hot path of four consumers as
      the record says. Read doctor.ts orphaned and supersededButCited (both on
      outboundReferences), sweep.ts holderIndex, kb-edges.ts (no body-link
      kind), and grepped bodyCitations to two callers, validate.ts and
      mirror-links.ts. The removed reader was quadratic: one bundle pass through
      edgeNeighbours(record, bundle, 'body-link') is 0.33/2.77/38.94 ms at
      n=100/400/1600 against 0.04/0.04/0.09 ms through outboundReferences, and
      doctor has two such passes. End to end on the built CLI, doctor --json is
      230/215/367 ms wall at the same sizes. Cost the record does not name,
      recorded as risk.inline-code-stripper-rescans-from-zero: the surviving
      parser is 6x the regex it replaced on a normal body and quadratic in
      backtick runs per line.
  - by: "agent:correctness"
    at: "2026-09-17T21:49:42.610Z"
    note: >-
      Read all four anchors at HEAD: KB_EDGE_KINDS is
      typed-link|supersession|anchor|source, composeRecord pushes
      relatedConceptIds into strauss_links as related_to with a seen set
      covering self and declared targets, outboundReferences filters
      isKbLinkRel, and validate.ts:107 is the only bodyCitations caller outside
      mirror-links. sweep/doctor/reassess/pack/trace read frontmatter alone.
      mirror-links --dry-run on this base reports 0 across 37 records, so the
      migration claim is satisfied here.
  - by: "agent:security"
    at: "2026-09-17T21:53:21.744Z"
    note: >-
      Security half. Read every consumer named: outboundReferences is the one
      reader of strauss_links and filters isKbLinkRel, bodyCitations has exactly
      two callers (validate.ts:107 and mirror-links.ts), and sweep's holderIndex
      indexes frontmatter links plus both supersession pointers only. The
      migration writes through store.updateLinks, which calls assertActor and
      logs the actor under operation mirror-links, and mirrorLinksCommand calls
      assertBaseNotFrozen after the dry-run return, so a frozen base answers but
      does not move. Targets it writes come from a regex built on
      KB_CONCEPT_ID_PATTERN, so nothing record-controlled becomes a path or an
      option. Two costs the decision does not carry, both already recorded
      elsewhere: the surviving parser is quadratic in backtick runs on
      contributed data, and a title reaching doctor's renderer is still
      unescaped.
strauss_anchors:
  - file: packages/strauss-kb/src/kb-edges.ts
    symbol: KB_EDGE_KINDS
    hash: "sha256:95950bbd40c908b0d60a2d9156b6a95cef48e6b384ca27d0b36b674fb5f893a6"
    hash_kind: raw
    resolved_at: "2026-09-17T21:32:21.234Z"
    lines: 6
    resolver: regex
  - file: packages/strauss-kb/src/body-citations.ts
    symbol: bodyCitations
    hash: "sha256:bee7a9a3e82dd3b568f239f5d1e121202ff79b08a8158810cab3c054687927a6"
    hash_kind: ast
    resolved_at: "2026-09-18T15:52:56.357Z"
    lines: 36
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/mirror-links.ts
    symbol: mirrorLinksCommand
    hash: "sha256:ac515283f36fcde06393cd66e5a40cfc08a741250835f9d78acc68493ce02269"
    hash_kind: raw
    resolved_at: "2026-09-18T16:32:01.193Z"
    lines: 67
    resolver: regex
  - file: packages/strauss-kb/src/compose.ts
    symbol: composeRecord
    hash: "sha256:5539098ce9f06e7691bf22b05a32af184caf75385258e589e94cd82b3bfc8b60"
    hash_kind: ast
    resolved_at: "2026-09-17T21:32:21.245Z"
    lines: 112
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-references/outbound.ts
    symbol: outboundReferences
    hash: "sha256:dc489e146f4ee68b4b8827d5de6b4fa8d897028d3293ca9f758f1d9c60c996b5"
    hash_kind: ast
    resolved_at: "2026-09-18T15:46:45.717Z"
    lines: 13
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-references/stale.ts
    symbol: staleReferencesFrom
    hash: "sha256:dca075a4bfa94e6cf14eae8f8b2183f72f845c20da59f4bab1408a330736ceae"
    hash_kind: ast
    resolved_at: "2026-09-18T15:46:45.719Z"
    lines: 29
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-references/model.ts
    symbol: KbOutboundReference
    hash: "sha256:07bd76be16aa4576ba678cb5582ae0f4bfc949515f8d30618c5c89dc9a5a035f"
    hash_kind: raw
    resolved_at: "2026-09-17T21:35:08.373Z"
    lines: 5
    resolver: regex
  - file: packages/strauss-kb/src/kb-references/index.ts
    symbol: KbStaleReference
    hash: "sha256:0c932a2eb8a5b53d4dd36b43e5f863823eab166fb83c26492a9993084cfda916"
    hash_kind: raw
    resolved_at: "2026-09-17T21:35:08.373Z"
    lines: 2
    resolver: regex
  - file: packages/strauss-kb/src/index.ts
    symbol: KbStaleReference
    hash: "sha256:41fe4e02a772aa6437ffe8908f32f47f8d73a9f1220a03b6b74b4ec047e5df44"
    hash_kind: raw
    resolved_at: "2026-09-17T21:35:08.374Z"
    lines: 2
    resolver: regex
  - file: packages/strauss-kb/src/drift/index.ts
    symbol: KbPacketReferences
    hash: "sha256:8d4e212d99442619a9a8b72c31b0af1f17f8ddf837fa9d3774504966c48b61aa"
    hash_kind: raw
    resolved_at: "2026-09-17T21:35:08.375Z"
    lines: 7
    resolver: regex
  - file: packages/strauss-kb/src/commands/index.ts
    symbol: KB_COMMANDS
    hash: "sha256:a75572d351e641f4f9faaf48062d1d03d875737527203d83f245feebdf3e4c37"
    hash_kind: raw
    resolved_at: "2026-09-17T21:35:08.375Z"
    lines: 37
    resolver: regex
strauss_links:
  - target: risk.unmigrated-base-loses-prose-edges
    rel: informs
strauss_status: superseded
strauss_supersedes:
  - decision.edge-consumers-read-body-and-frontmatter
strauss_superseded_by: decision.prose-is-read-only-to-detect-divergence
---

## Decision

An edge is a `strauss_links` entry. A record's prose renders the same claim for a reader that knows only OKF, and `compose` writes both at once — `relatedConceptIds` is stored as `related_to` and also rendered as a sentence. Nothing reads a body for edges.

`KbEdgeKind` is `typed-link | supersession | anchor | source`. `sweep`, `doctor`, `reassess`, `pack` and `trace` read frontmatter alone. `validate` is the one body read left: a citation `strauss_links` does not declare is a warning naming `mirror-links`, which is how a hand-edit or a foreign producer is found.

`mirror-links` is the one-time migration. Every base runs it once, before upgrading.

## Rationale

The superseded decision made every consumer read both halves. That closed the data loss but kept two representations, which is the thing that produced it — and it kept a body-citation parser on the hot path of four consumers. The parser was wrong twice inside one change: an inline-span regex that a longer backtick run defeated, and before that no fence awareness at all, so a record explaining the house style warned about itself.

One representation removes the class. The prose stays because OKF consumers read it, but it is output, and output is not a source of truth. The remaining parser has two callers and no consumer downstream of it: `validate` reports a divergence, `mirror-links` repairs one.

`related_to` is the only rel a citation can become. Prose states a pointer, never a direction of dependence, and inventing a stronger claim from a markdown link would put a dependency in the base nobody wrote.

## Rejected

Keeping both readers (the superseded decision). Rejected above.

Dropping the body read with no migration — every existing `relatedConceptIds` edge lived only in prose, so this deletes them, and `sweep` deletes the records they held. The migration is not a convenience; it is the half that makes the removal safe.

Letting `validate` stay silent about an unmirrored citation, on the grounds that prose is rendering. Rejected: a hand-edited record is the case the check exists for, and without it there is nothing that can prove a base finished the migration.

## Impact

A base that upgrades without running `mirror-links` loses every prose-only edge; in `sweep` that is a deletion. That is risk.unmigrated-base-loses-prose-edges, and the release notes lead with the command.

`KbEdgeKind` loses a member, which is a breaking type change for any consumer switching on it. Anyone adding an edge consumer reads `strauss_links` and does not parse prose; `bodyCitations` in body-citations.ts has two callers and must not acquire a third.

Informs [risk.unmigrated-base-loses-prose-edges](risk.unmigrated-base-loses-prose-edges.md).

[^SAA-821]: Every edge consumer reads both body citations and frontmatter links

[^SAA-824]: One representation for a related edge: maintain strauss_links from the body at write time
