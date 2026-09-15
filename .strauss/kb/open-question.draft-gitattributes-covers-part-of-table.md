---
type: open-question
title: >-
  Does draftGitattributes replace the default table, as
  decision.default-table-only-without-declared-classes says?
description: >-
  The decision's Impact and risk.hook-classes-shift-through-cli's mitigation
  rest on it.
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-15T15:46:23.691Z"
verified:
  - by: unknown
    at: "2026-09-15T15:49:23.589Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:02:40.789Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:04:32.199Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:06:30.407Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:13:13.193Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:22:28.678Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:22:50.365Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:25:36.516Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:35:45.613Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: "agent:author"
    at: "2026-09-15T16:47:29.982Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
strauss_anchors:
  - file: packages/code-diff/src/draft-gitattributes.ts
    symbol: draftGitattributesFrom
    hash: "sha256:330fca1c2e903ff1bdfb8bca2c78e980d8895bed45caefb2d7b84ab720ee04fd"
    hash_kind: ast
    resolved_at: "2026-09-15T16:02:26.360Z"
    lines: 34
    resolver: tree-sitter
strauss_links:
  - target: decision.default-table-only-without-declared-classes
    rel: informs
  - target: risk.hook-classes-shift-through-cli
    rel: informs
strauss_status: resolved
strauss_answered:
  by: mcp
  at: "2026-09-15T16:00:46.408Z"
strauss_owner: "agent:author"
---

## Question

The table matches markdown and docs/ as docs, and test/, tests/ and **mocks**/ as test. draftGitattributesFrom proposes lock files, CI dirs, .gitlab-ci.yml, **tests**, _.spec._, _.test._ and dist/build/vendor, and never a docs or test-directory line; its own spec expects an empty draft for README.md. Once a repo adopts the draft, repoDeclares is true and those paths turn `source`. Should the draft propose them, or should the records say it replaces part of the table?

## Why it matters

A repo following the recorded advice loses its docs and test-directory classes.

## Default assumption

The draft replaces the table only for lock files, CI and suffix-named tests; the mitigation is partial.

Informs [decision.default-table-only-without-declared-classes](decision.default-table-only-without-declared-classes.md).

Informs [risk.hook-classes-shift-through-cli](risk.hook-classes-shift-through-cli.md).

## Answer

It does now, except markdown. The draft proposes test/, tests/, **tests**/ and **mocks**/ directories and docs/, beside lock files, CI, _.spec._ / _.test._ and build output. *.md is left out on purpose: in an agent plugin markdown is often a prompt, and a repo should declare that itself. decision.default-table-only-on-a-read-undeclared-base records it.
