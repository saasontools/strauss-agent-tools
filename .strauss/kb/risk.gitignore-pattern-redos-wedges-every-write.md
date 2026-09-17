---
type: risk
title: A star-heavy line in a checked-in .gitignore wedges every base mutation
description: One repository file turns any kb write into an unbounded CPU spin.
tags:
  - review
  - "review:security"
generated:
  by: "agent:security"
  at: "2026-09-17T18:06:53.417Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-gitignore.ts
    symbol: matchesChild
    hash: "sha256:67ca83e74d9de493a3ea0128cb60993c1b50924122a3941a7f505a900d59065d"
    hash_kind: ast
    resolved_at: "2026-09-17T18:22:05.369Z"
    lines: 6
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-store.ts
    symbol: KbStore.ensureGitignore
    hash: "sha256:e3b6bfc7606d7f5f89014b5254b5e2873c2f97ccb8c91036ac793d609621dc58"
    hash_kind: ast
    resolved_at: "2026-09-17T18:22:05.393Z"
    lines: 8
    resolver: tree-sitter
strauss_links:
  - target: decision.kb-ignore-idempotence-by-covered-files
    rel: informs
strauss_status: open
strauss_materiality: blocking
strauss_confidence: high
---

## Risk

matchesChild compiles each existing ignore line into a regex, expanding every `*` to `[^/]*` (kb-gitignore.ts:57-60). A line of n consecutive stars followed by a non-matching character becomes n adjacent `[^/]*` groups, and `.test()` backtracks over every way to split the 21-character name `.index.sqlite-journal`. Measured on the shipped code: 10 stars 0.5s, 16 stars 78s, 18 stars did not finish in 400s inside a real `KbStore.write` against a bundle whose .gitignore held that one line. The regex is synchronous, so the MCP server's event loop stops with it; the best-effort catch in ensureDeclared never runs because nothing throws.

## Why it matters

The file is data the reviewer does not control: it arrives with a clone or a pull request, at `<bundle>/.gitignore` or `<workspace>/.strauss/.gitignore`. Any mutation — kb_write, kb_status, kb_verify, a local pin — hangs on it, and so does the hook that runs one. Denial of service on the tool, triggered by a line that reads as a plausible glob.

## Mitigation

None in the diff. Collapse runs of `*` to one before compiling, or cap the pattern length, or match the two supported wildcards with a linear scan instead of a regex. The covered names are fixed and short, so a hand-written matcher is a few lines.

## Verification

A spec that calls the write path against a .gitignore holding `'*'.repeat(18) + 'X'` returns under a second.

Informs [decision.kb-ignore-idempotence-by-covered-files](decision.kb-ignore-idempotence-by-covered-files.md).
