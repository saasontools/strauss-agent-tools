---
type: decision
title: >-
  strauss_links is the edge; prose is read only to detect that it has come apart
  — validate warns, mirror-links repairs, sweep refuses
description: >-
  The plugin channel launches strauss-kb@0.x, so a base reaches this release
  with no human to read a release note, and sweep's link-only hold guard would
  delete what a prose-only citation still cites.
sources:
  - id: SAA-821
    resource: >-
      https://linear.app/saason/issue/SAA-821/every-edge-consumer-reads-both-body-citations-and-frontmatter-links
    title: Every edge consumer reads both body citations and frontmatter links
generated:
  by: mcp
  at: "2026-09-18T16:31:29.129Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/body-citations.ts
    symbol: unmirroredCitations
    hash: "sha256:927a8beaa9250b2f9760473ac488bb531062f4593828618718bef110214f10ec"
    hash_kind: ast
    resolved_at: "2026-09-18T16:32:53.556Z"
    lines: 6
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/sweep.ts
    symbol: assertMigrated
    hash: "sha256:4c9477244b7285a15218fb126c9e7d5bfb024b523eca4a0e7059f181cec978dd"
    hash_kind: ast
    resolved_at: "2026-09-18T16:32:53.562Z"
    lines: 18
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-errors.ts
    symbol: KbUnmigratedBaseError
    hash: "sha256:5ba0cada083f55bcda00efba43baea0c67f346919fb84bc7a096bd836c14c001"
    hash_kind: ast
    resolved_at: "2026-09-18T16:32:53.566Z"
    lines: 20
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-edges.ts
    symbol: KB_EDGE_KINDS
    hash: "sha256:95950bbd40c908b0d60a2d9156b6a95cef48e6b384ca27d0b36b674fb5f893a6"
    hash_kind: raw
    resolved_at: "2026-09-18T16:32:53.568Z"
    lines: 6
    resolver: regex
  - file: packages/strauss-kb/src/kb-references/outbound.ts
    symbol: outboundReferences
    hash: "sha256:dc489e146f4ee68b4b8827d5de6b4fa8d897028d3293ca9f758f1d9c60c996b5"
    hash_kind: ast
    resolved_at: "2026-09-18T16:32:53.569Z"
    lines: 13
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-references/stale.ts
    symbol: staleReferencesFrom
    hash: "sha256:dca075a4bfa94e6cf14eae8f8b2183f72f845c20da59f4bab1408a330736ceae"
    hash_kind: ast
    resolved_at: "2026-09-18T16:32:53.570Z"
    lines: 29
    resolver: tree-sitter
  - file: packages/strauss-kb/src/compose.ts
    symbol: composeRecord
    hash: "sha256:5539098ce9f06e7691bf22b05a32af184caf75385258e589e94cd82b3bfc8b60"
    hash_kind: ast
    resolved_at: "2026-09-18T16:32:53.573Z"
    lines: 109
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/mirror-links.ts
    symbol: mirrorLinksCommand
    hash: "sha256:ac515283f36fcde06393cd66e5a40cfc08a741250835f9d78acc68493ce02269"
    hash_kind: raw
    resolved_at: "2026-09-18T16:32:53.575Z"
    lines: 67
    resolver: regex
  - file: packages/strauss-kb/src/kb-references/model.ts
    symbol: KbOutboundReference
    hash: "sha256:07bd76be16aa4576ba678cb5582ae0f4bfc949515f8d30618c5c89dc9a5a035f"
    hash_kind: raw
    resolved_at: "2026-09-18T16:32:53.575Z"
    lines: 5
    resolver: regex
  - file: packages/strauss-kb/src/kb-references/index.ts
    symbol: KbStaleReference
    hash: "sha256:0c932a2eb8a5b53d4dd36b43e5f863823eab166fb83c26492a9993084cfda916"
    hash_kind: raw
    resolved_at: "2026-09-18T16:32:53.576Z"
    lines: 2
    resolver: regex
  - file: packages/strauss-kb/src/index.ts
    symbol: KbStaleReference
    hash: "sha256:41fe4e02a772aa6437ffe8908f32f47f8d73a9f1220a03b6b74b4ec047e5df44"
    hash_kind: raw
    resolved_at: "2026-09-18T16:32:53.577Z"
    lines: 2
    resolver: regex
  - file: packages/strauss-kb/src/drift/index.ts
    symbol: KbPacketReferences
    hash: "sha256:8d4e212d99442619a9a8b72c31b0af1f17f8ddf837fa9d3774504966c48b61aa"
    hash_kind: raw
    resolved_at: "2026-09-18T16:32:53.577Z"
    lines: 7
    resolver: regex
  - file: packages/strauss-kb/src/commands/index.ts
    symbol: KB_COMMANDS
    hash: "sha256:a75572d351e641f4f9faaf48062d1d03d875737527203d83f245feebdf3e4c37"
    hash_kind: raw
    resolved_at: "2026-09-18T16:32:53.578Z"
    lines: 37
    resolver: regex
  - file: packages/strauss-kb/src/errors.ts
    symbol: ErrorTypes
    hash: "sha256:4b75fa6ed2a40fbba511b9f622782748dfc38fbb9a085cf06ef9af65bc0e4946"
    hash_kind: raw
    resolved_at: "2026-09-18T16:32:53.578Z"
    lines: 21
    resolver: regex
strauss_links:
  - target: risk.unmigrated-base-loses-prose-edges
    rel: informs
  - target: open-question.does-a-release-note-reach-an-auto-upgraded-base
    rel: related_to
strauss_status: accepted
strauss_supersedes:
  - decision.strauss-links-is-the-one-representation
---

## Decision

An edge is a `strauss_links` entry. `KbEdgeKind` is `typed-link | supersession | anchor | source`; `doctor`, `reassess`, `pack`, `trace` and the reference reads take frontmatter alone; `compose` stores `relatedConceptIds` as `related_to` and renders the sentence for OKF readers.

A body is parsed for one purpose — finding citations its `strauss_links` does not name (`unmirroredCitations`) — and three commands act on the answer, none of them by treating a citation as an edge: `validate` warns per record, `mirror-links` adds the missing `related_to`, and `sweep` refuses the whole base with `KbUnmigratedBaseError`, naming the records, until the migration has run. A body the parser refuses counts as unmigrated for `sweep`.

## Rationale

The superseded decision kept `sweep` body-blind and relied on the release note to get `mirror-links` run first. `plugins/strauss-kb/.mcp.json` launches `@saasontools/strauss-kb@0.x`, which 0.2.0 satisfies, so the plugin channel upgrades on its next restart and its first `sweep` is the likeliest to run before anyone reads a note. `sweep` is the one destructive verb, so it is the one that must not trust an unmigrated base.

Refusing rather than holding keeps prose out of the edge model: `sweep` never decides what to keep from a citation, it declines to decide at all. The check is the same one `validate` runs, so the three commands cannot disagree about what "unmigrated" means.

## Rejected

Holding every record a body cites — that makes prose an edge again inside `sweep`, the thing this change removed. Pinning the plugin to `0.1.x` — safe, but the plugin channel would not receive the release until someone moved the pin by hand. The release note alone — it does not reach a base that upgrades with no human in the loop.

## Impact

A base with any unmirrored citation, or any unreadable body, cannot be swept until `mirror-links` runs or the record is fixed; the refusal names the records. A hand-edit that adds a prose citation after the migration trips it again, which is the intended signal. `sweep` pays one parse pass over bodies that contain `.md`.

Informs [risk.unmigrated-base-loses-prose-edges](risk.unmigrated-base-loses-prose-edges.md).

Relates to [open-question.does-a-release-note-reach-an-auto-upgraded-base](open-question.does-a-release-note-reach-an-auto-upgraded-base.md).

[^SAA-821]: Every edge consumer reads both body citations and frontmatter links
