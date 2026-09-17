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
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-store.ts
    symbol: KbStore.ensureDeclared
  - file: packages/strauss-kb/src/kb-store.ts
    symbol: KbStore.ensureGitignore
  - file: packages/strauss-kb/src/kb-store.ts
    symbol: KbStore.record
  - file: packages/strauss-kb/src/kb-pins/layers.ts
    symbol: writePinsLayer
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
