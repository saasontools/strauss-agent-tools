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
verified:
  - by: "agent:performance"
    at: "2026-09-17T21:49:23.625Z"
    note: >-
      Cost of the migration the record makes mandatory, measured on the built
      CLI: mirror-links is 273/613/1632 ms wall at n=100/400/1600 (node startup
      ~150 ms included), i.e. about 1 ms per rewritten record, linear. --dry-run
      is flat at 212-272 ms since it writes nothing. Each rewrite is a
      sequential await through KbStore.mutate (two reads, write, rename, unlink,
      log append) with no concurrency, and one readIndex at the end re-lists the
      base once rather than per record. 1.5 s once per base is not worth
      parallelising.
  - by: "agent:security"
    at: "2026-09-17T21:54:18.568Z"
    note: >-
      Data-loss half, end to end on the dist built at HEAD. Scratch bundle where
      fact.prose-only's only mention of decision.new-way is a prose sentence:
      doctor lists decision.new-way under orphaned, validate returns exactly one
      body_link warning naming the citer, and mirror-links --dry-run reports the
      one pending edge. sweep's holderIndex indexes strauss_links and both
      supersession pointers only, so on that base the target is a deletion
      candidate with nothing to hold it - the deletion, not the warning, that
      the record predicts.
strauss_anchors:
  - file: packages/strauss-kb/src/commands/mirror-links.ts
    symbol: mirrorLinksCommand
    hash: "sha256:fb5522c26c108f7528107420a22a228e0aa964dcca2098de6070f1ff2b1a2dd1"
    hash_kind: raw
    resolved_at: "2026-09-18T15:40:42.372Z"
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
