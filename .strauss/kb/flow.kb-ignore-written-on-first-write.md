---
type: flow
title: Every mutation ensures the base's declaration files
description: >-
  The store has no create step, so first write is the only moment a base is
  born; `record` is the one path every mutation reaches, and it now ensures
  `.gitattributes` and `.gitignore` together through one routine. A base created
  before either rule existed gains it on its next write, which is also the
  repair path for a file a user deleted. The pins layers have the same shape:
  writing the local manifest ensures the workspace rule beside it.
sources:
  - id: SAA-815
    resource: >-
      https://linear.app/saason/issue/SAA-815/create-scoped-git-ignore-rules-when-initializing-a-strauss-kb
    title: Create scoped Git ignore rules when initializing a Strauss KB
generated:
  by: mcp
  at: "2026-09-17T17:47:41.423Z"
verified:
  - by: "agent:prose"
    at: "2026-09-17T17:59:36.424Z"
    note: >-
      Read ensureDeclared, ensureGitignore and ensureLocalPinsIgnored; the
      record's Failure modes restate the ENOENT and append-race paragraphs of
      the ensureDeclared comment.
  - by: "agent:performance"
    at: "2026-09-17T18:00:44.748Z"
    note: >-
      Read KbStore.record: both ensures run under one Promise.all, not in
      sequence; measured 0.135 ms for the pair against 0.093 ms for the single
      read before. ensureLocalPinsIgnored runs after mkdir and before the
      manifest write, a sequence the ordering requires.
  - by: "agent:correctness"
    at: "2026-09-17T18:11:41.748Z"
    note: >-
      Read every caller of KbStore.record (write, verify, deleteRecord, note,
      mutate, kb-store.ts:244/434/547/956/1036) — all mutations, no read verb;
      ensureDeclared creates only on ENOENT and appends only the missing lines;
      setStatus after unlinking .gitignore restores it. Confirmed with git
      check-ignore at .strauss/kb and at docs/adr.
strauss_anchors:
  - file: packages/strauss-kb/src/kb-store.ts
    symbol: KbStore.ensureDeclared
    hash: "sha256:31722d6ef8c8a55c67f9e1df84048e1c8400a661489f1c72fa119ef6ec0cd4a6"
    hash_kind: ast
    resolved_at: "2026-09-17T17:52:24.467Z"
    lines: 58
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-store.ts
    symbol: KbStore.ensureGitignore
    hash: "sha256:e3b6bfc7606d7f5f89014b5254b5e2873c2f97ccb8c91036ac793d609621dc58"
    hash_kind: ast
    resolved_at: "2026-09-17T17:52:24.468Z"
    lines: 8
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-store.ts
    symbol: KbStore.record
    hash: "sha256:b2dd9fd5139d2345b87f81f93f08fdf824d5379a586970864afe3edfa6be1ab7"
    hash_kind: ast
    resolved_at: "2026-09-17T17:52:24.468Z"
    lines: 17
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-pins/layers.ts
    symbol: writePinsLayer
    hash: "sha256:c9d3026f7abf8e552679810778243d821448da59daf77f6502a7a2c110c03200"
    hash_kind: ast
    resolved_at: "2026-09-17T17:52:24.469Z"
    lines: 10
    resolver: tree-sitter
strauss_verify:
  - setStatus on a base whose .gitignore was deleted restores it
  - >-
    a .gitignore that cannot be read leaves the path untouched and the write
    still succeeds
strauss_links:
  - target: decision.kb-ignore-anchored-per-location
    rel: satisfies
strauss_status: accepted
---

## Trigger

Any mutation — kb_write, kb_status, kb_verify, kb_supersede — and, for the workspace rule, a pin written to the local layer.

## Steps

KbStore.record -> ensureGitattributes and ensureGitignore in parallel -> ensureDeclared: read the file; create it with `wx` on ENOENT; otherwise append only the lines it lacks.

pinBase({ layer: "local" }) -> writePinsLayer -> ensureLocalPinsIgnored -> <workspace>/.strauss/.gitignore.

## Failure modes

Both steps are best-effort: a declaration file that cannot be written must never fail the mutation that triggered it. A read failing with anything but ENOENT is not "missing", so the path is left untouched rather than truncated. Two writers racing the append leave a duplicate line, which the next call reads as already declared.

Satisfies [decision.kb-ignore-anchored-per-location](decision.kb-ignore-anchored-per-location.md).

[^SAA-815]: Create scoped Git ignore rules when initializing a Strauss KB
