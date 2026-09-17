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
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-gitignore.ts
    symbol: SEARCH_INDEX_RULE
  - file: packages/strauss-kb/src/kb-gitignore.ts
    symbol: LOCAL_PINS_RULE
  - file: packages/strauss-kb/src/kb-pins/layers.ts
    symbol: ensureLocalPinsIgnored
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
