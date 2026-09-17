---
type: decision
title: "The why of the ignore rules lives in the records, not above the functions"
description: >-
  AGENTS.md caps a code comment at four lines and sends the reason to a record.
  Generalising ensureGitattributes into ensureDeclared was the moment its
  37-line comment should have been cut, and it was not: the comment is now the
  invariant — created with `wx` or appended to, never rewritten; a read failing
  with anything but ENOENT is not missing; best-effort — and points at
  flow.kb-ignore-written-on-first-write for the trigger, the append race and the
  rest. The negation rationale is cut from isSettled's comment the same way; the
  record and the specification section carry it.
generated:
  by: mcp
  at: "2026-09-17T18:21:33.638Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-store.ts
    symbol: KbStore.ensureDeclared
    hash: "sha256:9bbf334daca7c3894834539b56d3be95222816ede9ba9fab3fad14686440b4ff"
    hash_kind: ast
    resolved_at: "2026-09-17T18:42:08.196Z"
    lines: 80
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-gitignore.ts
    symbol: ignoreRuleState
    hash: "sha256:69164de172ce59c24a620fba7434521831fe2a700ec481099ef23232ebf98797"
    hash_kind: ast
    resolved_at: "2026-09-17T18:22:04.085Z"
    lines: 8
    resolver: tree-sitter
strauss_verify:
  - the comment above ensureDeclared is at most six lines and names the record
  - the flow record still names every failure mode the comment dropped
strauss_links:
  - target: risk.ensure-declared-comment-outgrew-its-record
    rel: informs
  - target: risk.ignore-rationale-restated-in-four-homes
    rel: informs
strauss_status: accepted
---

## Decision

The why of the ignore rules lives in the records, not above the functions

## Rationale

AGENTS.md caps a code comment at four lines and sends the reason to a record. Generalising ensureGitattributes into ensureDeclared was the moment its 37-line comment should have been cut, and it was not: the comment is now the invariant — created with `wx` or appended to, never rewritten; a read failing with anything but ENOENT is not missing; best-effort — and points at flow.kb-ignore-written-on-first-write for the trigger, the append race and the rest. The negation rationale is cut from isSettled's comment the same way; the record and the specification section carry it.

## Rejected

Leaving both comments: every reader of the function pays for them, and two accounts of the ENOENT rule drift the first time one is edited. The parallel copies in kb-gitattributes.ts predate this change and are left alone rather than swept in.

Informs [risk.ensure-declared-comment-outgrew-its-record](risk.ensure-declared-comment-outgrew-its-record.md).

Informs [risk.ignore-rationale-restated-in-four-homes](risk.ignore-rationale-restated-in-four-homes.md).
