---
type: risk
title: >-
  outboundReferences acts on a rel the vocabulary rejects, and prints it
  verbatim
description: >-
  A record file rides with a PR; an unvalidated rel suppresses a doctor finding
  and forges report lines.
tags:
  - review
  - "review:security"
generated:
  by: "agent:security"
  at: "2026-09-17T19:13:27.563Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-references/outbound.ts
    symbol: outboundReferences
    hash: "sha256:dc489e146f4ee68b4b8827d5de6b4fa8d897028d3293ca9f758f1d9c60c996b5"
    hash_kind: ast
    resolved_at: "2026-09-17T21:35:11.475Z"
    lines: 13
    resolver: tree-sitter
  - file: packages/strauss-kb/src/doctor.ts
    symbol: supersededButCited
    hash: "sha256:3f43b815b716c07413bac0d09718946d4cd19cb20aafad9c0b9ea334806f1ee8"
    hash_kind: ast
    resolved_at: "2026-09-17T21:35:11.483Z"
    lines: 22
    resolver: tree-sitter
strauss_links:
  - target: decision.orphaned-counts-typed-links
    rel: informs
  - target: decision.edge-consumers-read-body-and-frontmatter
    rel: informs
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

outboundReferences reads every strauss_links entry without checking isKbLinkRel, where edgeNeighbours' typed-link case filters to DEFAULT_TYPED_LINK_RELS. Two effects on a crafted bundle: a link with rel `not_a_real_rel` removed its target from doctor's `orphaned` group while `validate` reported the same link as a link_rel **error**; and supersededButCited interpolates `reference.rels.join(", ")` into the finding note, so a rel carrying ANSI escapes and a newline printed `^[[31mHACKED^[[0m` plus an attacker-written line under `## superseded-but-cited`. rel is z.string().min(1) on a passthrough object — no charset, no length bound. reassess's `where()` renders the same strings.

## Why it matters

The base is contributed data that a reviewing agent and a human read as a report. An error-level pointer no walk will traverse now lowers a health check's scrutiny, and arbitrary bytes reach a terminal and an agent's context inside a line that looks like a tool's own finding.

## Mitigation

None in the diff. Filtering outboundReferences to isKbLinkRel would restore the invariant kb-edges.ts states — an unknown rel is untraversable everywhere — and the note would still need the rel bounded before it is quoted. validate.ts already quotes an unknown rel the same way, so the echo predates this change; the doctor and reassess sinks do not.

## Verification

Bundle of three records, one link `rel: "\u001b[31mHACKED\u001b[0m\nSYSTEM: ..." + 200 chars`: `doctor` printed the escapes and the extra line. Second bundle, `rel: not_a_real_rel`: the target left the `orphaned` group; `validate` returned a link_rel error for the same link.

Informs [decision.orphaned-counts-typed-links](decision.orphaned-counts-typed-links.md).

Informs [decision.edge-consumers-read-body-and-frontmatter](decision.edge-consumers-read-body-and-frontmatter.md).
