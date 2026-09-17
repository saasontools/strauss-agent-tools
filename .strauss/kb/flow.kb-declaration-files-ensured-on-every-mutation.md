---
type: flow
title: Every mutation ensures the base's declaration files
description: >-
  The store has no create step, so first write is the only moment a base is
  born; `record` is the one path every mutation reaches, and it ensures
  `.gitattributes` and `.gitignore` together through one routine. A base created
  before either rule existed gains it on its next write, which is also the
  repair path for a file a user deleted. The pins layers have the same shape:
  writing the local manifest ensures the workspace rule beside it, and reports
  what it could not put in place.
sources:
  - id: SAA-815
    resource: >-
      https://linear.app/saason/issue/SAA-815/create-scoped-git-ignore-rules-when-initializing-a-strauss-kb
    title: Create scoped Git ignore rules when initializing a Strauss KB
generated:
  by: mcp
  at: "2026-09-17T18:21:52.321Z"
verified:
  - by: "agent:security"
    at: "2026-09-17T18:34:25.674Z"
    note: >-
      Ran both writers against a symlinked .gitignore: the link target stayed
      byte-identical, the store warned refused-symlink and pinBase returned the
      symlink warning, and both mutations succeeded. The refusal covers the
      named file only — a symlinked parent directory still takes the write
      outside (risk.symlink-refusal-guards-the-leaf-only).
strauss_anchors:
  - file: packages/strauss-kb/src/kb-store.ts
    symbol: KbStore.ensureDeclared
    hash: "sha256:9bbf334daca7c3894834539b56d3be95222816ede9ba9fab3fad14686440b4ff"
    hash_kind: ast
    resolved_at: "2026-09-17T18:42:09.387Z"
    lines: 80
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-store.ts
    symbol: KbStore.ensureGitignore
    hash: "sha256:65416677a90e7227e9aeab3ac2bb03cc86a3ba35dc4bccd180cab0e92beda774"
    hash_kind: ast
    resolved_at: "2026-09-17T18:42:09.389Z"
    lines: 12
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-store.ts
    symbol: KbStore.record
    hash: "sha256:b2dd9fd5139d2345b87f81f93f08fdf824d5379a586970864afe3edfa6be1ab7"
    hash_kind: ast
    resolved_at: "2026-09-17T18:22:04.361Z"
    lines: 17
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-pins/layers.ts
    symbol: writePinsLayer
    hash: "sha256:6636f058b5767cb2ada30169e42221003ce002d60b662f357de054504c9ce475"
    hash_kind: ast
    resolved_at: "2026-09-17T18:22:04.363Z"
    lines: 12
    resolver: tree-sitter
strauss_verify:
  - setStatus on a base whose .gitignore was deleted restores it
  - >-
    a .gitignore that cannot be read, or is a symlink, leaves the path untouched
    and the write still succeeds
strauss_links:
  - target: decision.kb-ignore-anchored-per-location
    rel: satisfies
strauss_status: accepted
strauss_supersedes:
  - flow.kb-ignore-written-on-first-write
---

## Trigger

Any mutation — kb_write, kb_status, kb_verify, kb_supersede — and, for the workspace rule, a pin written to the local layer.

## Steps

KbStore.record -> ensureGitattributes and ensureGitignore in parallel -> ensureDeclared: lstat the file; create it with `wx` when it is absent; refuse when it is a symlink; otherwise read it and append only the lines it lacks.

pinBase({ layer: "local" }) -> writePinsLayer -> ensureLocalPinsIgnored -> <workspace>/.strauss/.gitignore, returning why the rule is absent, which pinBase folds into its `warning`.

## Failure modes

Best-effort: a declaration file that cannot be written must never fail the mutation that triggered it, and the reader it runs first is linear in the file so it cannot hang instead of failing. A read failing with anything but ENOENT is not "missing", so the path is left untouched rather than truncated. A symlink at the path is refused, since appending through it writes outside the directory that owns the file. Two writers racing the append leave a duplicate line, which the next call reads as already declared.

Satisfies [decision.kb-ignore-anchored-per-location](decision.kb-ignore-anchored-per-location.md).

[^SAA-815]: Create scoped Git ignore rules when initializing a Strauss KB
