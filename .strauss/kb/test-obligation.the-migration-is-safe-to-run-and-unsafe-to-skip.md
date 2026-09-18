---
type: test-obligation
title: "mirror-links mirrors what the prose states, and sweep is blind without it"
description: >-
  The migration is the only thing standing between an upgrade and a base that
  deletes records it can no longer see.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-17T21:31:46.341Z"
verified:
  - by: "agent:correctness"
    at: "2026-09-17T21:49:42.749Z"
    note: >-
      Ran mirror-links.spec.ts, sweep.spec.ts, references.spec.ts,
      body-citations.spec.ts, doctor.spec.ts, kb-edges.spec.ts: 92 pass.
      unmirrored() keeps a target that already carries any rel,
      assertBaseNotFrozen is after the dry-run return, and sweep.spec.ts 'does
      not see a citation that only ever lived in the prose' asserts the
      candidate plus the body_link warning. Not covered: an indented fence,
      which unmirrored does mirror - risk.an-indented-fence-is-still-a-citation.
strauss_anchors:
  - file: packages/strauss-kb/src/body-citations.ts
    symbol: unmirroredCitations
    hash: "sha256:927a8beaa9250b2f9760473ac488bb531062f4593828618718bef110214f10ec"
    hash_kind: ast
    resolved_at: "2026-09-18T16:32:54.029Z"
    lines: 6
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/sweep.ts
    symbol: holderIndex
    hash: "sha256:d2c24ba5da81eb30c820a41af845b5b13b35e77a7cd59a39114345dd175c4d8d"
    hash_kind: ast
    resolved_at: "2026-09-17T21:32:21.672Z"
    lines: 19
    resolver: tree-sitter
strauss_links:
  - target: risk.unmigrated-base-loses-prose-edges
    rel: satisfies
strauss_status: superseded
strauss_superseded_by: test-obligation.sweep-refuses-an-unmigrated-base
---

## Obligation

`mirror-links` adds `related_to` for a citation `strauss_links` does not declare, leaves a target that already carries a rel alone, ignores a citation inside a fence or a code span, is idempotent, writes nothing under `--dry-run`, and refuses on a frozen base while still answering `--dry-run`.

The other half is the failure it prevents: a record whose only mention of a terminal record is a hand-written sentence does not hold it, `sweep --dry-run` lists that record as a candidate, and `validate` names the citing record.

## Why it matters

Half of this is a migration nobody watches run. The other half is what happens on a base where it did not: a deletion, not a warning, and the `--dry-run` that would normally catch it answers from the same blind index.

## How to verify

`src/commands/mirror-links.spec.ts` covers the migration's six behaviours against a real store. `src/commands/sweep.spec.ts` — "does not see a citation that only ever lived in the prose" — appends the sentence by hand and asserts the record is a sweep candidate with `validate` reporting `body_link` against the citer.

Satisfies [risk.unmigrated-base-loses-prose-edges](risk.unmigrated-base-loses-prose-edges.md).
