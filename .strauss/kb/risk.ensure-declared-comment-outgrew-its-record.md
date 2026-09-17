---
type: risk
title: >-
  The 37-line essay above ensureDeclared duplicates
  flow.kb-ignore-written-on-first-write
description: Code comments are the invariant in four lines; the why has a record now.
tags:
  - review
  - "review:docs"
generated:
  by: "agent:prose"
  at: "2026-09-17T17:58:31.856Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-store.ts
    symbol: KbStore.ensureDeclared
    hash: "sha256:9bbf334daca7c3894834539b56d3be95222816ede9ba9fab3fad14686440b4ff"
    hash_kind: ast
    resolved_at: "2026-09-17T18:42:10.979Z"
    lines: 80
    resolver: tree-sitter
strauss_links:
  - target: flow.kb-ignore-written-on-first-write
    rel: informs
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

The doc comment on KbStore.ensureDeclared was generalised in this range and left at 37 lines: the trigger, the wx race, the ENOENT misreading, the unguarded append race and the best-effort promise. flow.kb-ignore-written-on-first-write now states the same trigger and the same three failure modes.

## Why it matters

AGENTS.md caps a code comment at four lines and sends the why to ARCHITECTURE.md or a record. Generalising the comment was the moment to move it; two accounts of the ENOENT rule will drift, and the essay is paid by every reader of the function.

## Mitigation

Cut to the invariant and a link: the file is created with `wx` or appended to, never rewritten; a read that fails with anything but ENOENT is not missing; best-effort, never fails the mutation. The rest is already in the flow record and in ARCHITECTURE.md's lock rejection.

## Verification

The comment above ensureDeclared is four lines or fewer, and the flow record still names every failure mode it dropped.

Informs [flow.kb-ignore-written-on-first-write](flow.kb-ignore-written-on-first-write.md).
