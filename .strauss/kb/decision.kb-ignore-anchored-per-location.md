---
type: decision
title: "Ignore rules are anchored, one file per directory that owns the files"
description: >-
  A base is addressable at any path (--bundle), so its ignore rule must travel
  with it: <kb>/.gitignore carries `/.index.sqlite*`, leading slash, excluding
  that base's derived files and no other's. Personal pins live at
  <workspace>/.strauss/kb-pins.local.json, outside every base, so they get a
  second rule in <workspace>/.strauss/.gitignore, written when the local layer
  is first written; the committed kb-pins.json sits beside it and the pattern
  names one file exactly.
sources:
  - id: SAA-815
    resource: >-
      https://linear.app/saason/issue/SAA-815/create-scoped-git-ignore-rules-when-initializing-a-strauss-kb
    title: Create scoped Git ignore rules when initializing a Strauss KB
generated:
  by: mcp
  at: "2026-09-17T17:47:02.381Z"
verified:
  - by: "agent:prose"
    at: "2026-09-17T17:59:36.012Z"
    note: >-
      Read SEARCH_INDEX_RULE and LOCAL_PINS_RULE against the new
      specification.md section and the README/overview layout blocks; the
      anchored-per-location rule is stated the same way in each.
  - by: "agent:security"
    at: "2026-09-17T18:07:25.126Z"
    note: >-
      Read SEARCH_INDEX_RULE, LOCAL_PINS_RULE and ensureLocalPinsIgnored: the
      base rule is leading-slash anchored and written under the bundle root
      passed to ensureGitignore, and the pins rule is written to
      dirname(layerFile) for the local layer only, never the user layer.
  - by: "agent:correctness"
    at: "2026-09-17T18:11:41.960Z"
    note: >-
      Ran check-ignore in a throwaway repo: /.index.sqlite* excludes the base's
      index and its -wal/-shm/-journal and nothing above the base, at KB_DIR and
      at docs/adr; /kb-pins.local.json is written to
      <workspace>/.strauss/.gitignore on a local pin only, and kb-pins.json
      stays tracked.
strauss_anchors:
  - file: packages/strauss-kb/src/kb-gitignore.ts
    symbol: SEARCH_INDEX_RULE
    hash: "sha256:65cce700e9cea9461f83812085b63281876cf70375f2b329da5c9fe1c71f5e77"
    hash_kind: raw
    resolved_at: "2026-09-17T17:52:12.899Z"
    lines: 9
    resolver: regex
  - file: packages/strauss-kb/src/kb-gitignore.ts
    symbol: LOCAL_PINS_RULE
    hash: "sha256:4947f31e7a916af10bb4b2f9e3ee5ec2caaeb8a2ce188989b2c2af373aeed5fd"
    hash_kind: raw
    resolved_at: "2026-09-17T17:52:12.899Z"
    lines: 4
    resolver: regex
  - file: packages/strauss-kb/src/kb-pins/layers.ts
    symbol: ensureLocalPinsIgnored
    hash: "sha256:6da23b50aaecc182cabc04bc0d9264b9701234d6c9c5ed3f126a0d95cd1cde60"
    hash_kind: ast
    resolved_at: "2026-09-17T18:22:03.126Z"
    lines: 37
    resolver: tree-sitter
strauss_verify:
  - >-
    git check-ignore -q <kb>/.index.sqlite-wal at the default base and at a
    custom one
  - >-
    git check-ignore -q .strauss/kb-pins.local.json after a local pin, while
    .strauss/kb-pins.json is not ignored
strauss_status: accepted
---

## Decision

Ignore rules are anchored, one file per directory that owns the files

## Rationale

A base is addressable at any path (--bundle), so its ignore rule must travel with it: <kb>/.gitignore carries `/.index.sqlite*`, leading slash, excluding that base's derived files and no other's. Personal pins live at <workspace>/.strauss/kb-pins.local.json, outside every base, so they get a second rule in <workspace>/.strauss/.gitignore, written when the local layer is first written; the committed kb-pins.json sits beside it and the pattern names one file exactly.

## Rejected

One rule for both, in the base's .gitignore: a pattern there cannot reach a parent directory, so `../kb-pins.local.json` would be an ineffective line that reads as protection. Rejected. A single repository-root .gitignore: it only knows the default .strauss/kb and misses every custom bundle path, and it is the user's file, not the store's.

[^SAA-815]: Create scoped Git ignore rules when initializing a Strauss KB
