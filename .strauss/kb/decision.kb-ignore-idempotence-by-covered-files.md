---
type: decision
title: "A rule is settled by what git already excludes, not by matching our own line"
description: >-
  Each rule names the files it exists to exclude, and the writer asks git's
  question of the existing file: is every covered name already ignored? A user's
  own `*.sqlite*` therefore settles the rule and no second line is appended,
  while `/.index.sqlite` alone does not, because the -wal and -shm sidecars stay
  tracked. A `!` line that matches is treated as settled too: git resolves
  repeated matches by last-one-wins, so appending over it would overrule a
  deliberate choice to track the file, the same respect the .gitattributes
  writer gives a hand-set merge=ours.
sources:
  - id: SAA-815
    resource: >-
      https://linear.app/saason/issue/SAA-815/create-scoped-git-ignore-rules-when-initializing-a-strauss-kb
    title: Create scoped Git ignore rules when initializing a Strauss KB
generated:
  by: mcp
  at: "2026-09-17T17:47:14.915Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-gitignore.ts
    symbol: isSettled
  - file: packages/strauss-kb/src/kb-gitignore.ts
    symbol: matchesChild
strauss_verify:
  - >-
    missingIgnoreLines returns [] for a user pattern covering every sidecar, and
    the rule for one covering only the database
  - a second write appends nothing
strauss_links:
  - target: decision.kb-ignore-anchored-per-location
    rel: informs
strauss_status: accepted
---

## Decision

A rule is settled by what git already excludes, not by matching our own line

## Rationale

Each rule names the files it exists to exclude, and the writer asks git's question of the existing file: is every covered name already ignored? A user's own `*.sqlite*` therefore settles the rule and no second line is appended, while `/.index.sqlite` alone does not, because the -wal and -shm sidecars stay tracked. A `!` line that matches is treated as settled too: git resolves repeated matches by last-one-wins, so appending over it would overrule a deliberate choice to track the file, the same respect the .gitattributes writer gives a hand-set merge=ours.

## Rejected

Exact-string matching against our own pattern, as the first cut of the .gitattributes writer did: it appends a redundant line beside any equivalent user rule and cannot see a negation at all. Rejected. Full gitignore semantics: the rules only ever cover files directly beside the ignore file, so only `*` and `?` are expanded and an unsupported construct fails to match, costing a redundant line and never a wrong exclusion.

Informs [decision.kb-ignore-anchored-per-location](decision.kb-ignore-anchored-per-location.md).

[^SAA-815]: Create scoped Git ignore rules when initializing a Strauss KB
