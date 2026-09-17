---
type: risk
title: >-
  A base that upgrades without running mirror-links loses its prose-only edges,
  and sweep deletes on the difference
description: >-
  The failure is silent at read time and destructive at sweep time, on somebody
  else's base, after release.
generated:
  by: mcp
  at: "2026-09-17T21:31:18.533Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/mirror-links.ts
    symbol: mirrorLinksCommand
    hash: "sha256:1cd118a3d9beb7a6014a84db8d0f7ed5828a6a4919255a60b06092f4e307d794"
    hash_kind: raw
    resolved_at: "2026-09-17T21:32:21.454Z"
    lines: 65
    resolver: regex
  - file: packages/strauss-kb/src/commands/sweep.ts
    symbol: holderIndex
    hash: "sha256:d2c24ba5da81eb30c820a41af845b5b13b35e77a7cd59a39114345dd175c4d8d"
    hash_kind: ast
    resolved_at: "2026-09-17T21:32:21.460Z"
    lines: 19
    resolver: tree-sitter
strauss_status: open
strauss_materiality: important
strauss_confidence: high
---

## Risk

Every `relatedConceptIds` edge written before this change lives only in the record's prose. After the upgrade nothing reads prose, so on an unmigrated base those edges are gone from `doctor`, `reassess`, `pack`, `trace` and `kb_backlinks` — and gone from `sweep`'s hold guard, which deletes a terminal record no survivor appears to point at. `validate` reports the divergence, but only if someone runs it, and `sweep --dry-run` answers from the same blind index.

## Why it matters

This repository's own base needed the migration on two records, so a base with a real history needs it on many. The package cannot run the migration for a consumer: it is their file tree, and a write on load would be a mutation nobody asked for. The whole mitigation is that somebody reads the release note.

## Mitigation

The version plan leads with the command, the CLI and MCP references say "run this once per base before upgrading", and `validate`'s warning names `mirror-links` by name. Not taken: refusing to run against a base with unmirrored citations, which would turn every read verb into a migration gate, and auto-migrating on write, which mutates a base as a side effect of reading it.

## Verification

On a base written before this change: `strauss-kb validate` reports `body_link` warnings, `strauss-kb sweep --tag review --terminal --dry-run` lists candidates that `mirror-links` then rescues, and a second `--dry-run` after the migration reports them under `skipped` instead.
