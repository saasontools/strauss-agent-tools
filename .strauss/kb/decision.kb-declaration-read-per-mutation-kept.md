---
type: decision
title: The per-mutation declaration read stays; the test suite's spawns do not
description: >-
  Reading both declaration files on every mutation is what makes a deleted rule
  come back on the next write, which is the repair path the acceptance criteria
  ask for. The measured cost is +0.04ms per mutation, and 52ms against 26ms for
  a promote of 100 records. A Set of roots already ensured on the KbStore
  instance would halve that and would stop repairing a file deleted mid-process,
  so the read stays and the number is recorded rather than removed. The git
  spec's spawns had no such defence: it now asks check-ignore about every path
  in one spawn and bounds each with a timeout.
generated:
  by: mcp
  at: "2026-09-17T18:21:22.228Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-store.ts
    symbol: KbStore.record
    hash: "sha256:b2dd9fd5139d2345b87f81f93f08fdf824d5379a586970864afe3edfa6be1ab7"
    hash_kind: ast
    resolved_at: "2026-09-17T18:22:03.699Z"
    lines: 17
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-gitignore.git.spec.ts
    hash: "sha256:219acb919353ad06fcc4fd66b4487bc65bdf57fe7b58d2505cace859f77183cf"
    hash_kind: raw
    resolved_at: "2026-09-17T18:22:03.700Z"
    lines: 182
strauss_verify:
  - kb-store.spec's 'is repaired by setStatus' still passes
  - src/kb-gitignore.git.spec.ts spawns git once per assertion group
strauss_links:
  - target: risk.kb-declaration-reads-repeat-per-mutation
    rel: informs
  - target: risk.kb-gitignore-git-spec-unbounded-spawns
    rel: informs
strauss_status: accepted
---

## Decision

The per-mutation declaration read stays; the test suite's spawns do not

## Rationale

Reading both declaration files on every mutation is what makes a deleted rule come back on the next write, which is the repair path the acceptance criteria ask for. The measured cost is +0.04ms per mutation, and 52ms against 26ms for a promote of 100 records. A Set of roots already ensured on the KbStore instance would halve that and would stop repairing a file deleted mid-process, so the read stays and the number is recorded rather than removed. The git spec's spawns had no such defence: it now asks check-ignore about every path in one spawn and bounds each with a timeout.

## Rejected

Memoising ensured roots per store instance. Rejected: the repair property is the feature, and the saving is tens of milliseconds on the largest operation in the package. Also rejected: dropping the second read by ensuring .gitignore only from `write` — a base mutated only through setStatus or verify would never gain the rule.

Informs [risk.kb-declaration-reads-repeat-per-mutation](risk.kb-declaration-reads-repeat-per-mutation.md).

Informs [risk.kb-gitignore-git-spec-unbounded-spawns](risk.kb-gitignore-git-spec-unbounded-spawns.md).
