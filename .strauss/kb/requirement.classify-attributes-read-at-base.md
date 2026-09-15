---
type: requirement
title: >-
  File classes come from .gitattributes at the base commit, so a change cannot
  reclassify its own files
description: >-
  A branch that marks the file it changes `linguist-generated` would otherwise
  lower its own review.
tags:
  - review
  - "review:security"
sources:
  - id: saa-810
    resource: "https://linear.app/saason/issue/SAA-810"
generated:
  by: mcp
  at: "2026-09-15T15:30:23.025Z"
verified:
  - by: unknown
    at: "2026-09-15T15:33:12.723Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
strauss_anchors:
  - file: packages/code-diff/src/classify/attributes.ts
    symbol: readAttributes
    hash: "sha256:80f6a54441078cc6e9246c74bdaab0c627efb043cdfa81ef9216ef312f2bf017"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:34.984Z"
    lines: 16
    resolver: tree-sitter
strauss_links:
  - target: test-obligation.classify-ignores-branch-attributes
    rel: verified_by
strauss_status: proposed
---

## Claim

One `git check-attr --source=<base> --stdin` over every changed path; `linguist-generated`/`linguist-vendored` → generated, `linguist-documentation` → docs, `strauss-class=test|ci|config|lockfile` → that class. git before 2.40 has no `--source`: the working tree answers and the classifier's notes say so.

## Evidence

SAA-810, `.gitattributes` in the classifier.

## Implication

A new attribute takes effect once it is merged.

Verified by [test-obligation.classify-ignores-branch-attributes](test-obligation.classify-ignores-branch-attributes.md).

[^saa-810]: https://linear.app/saason/issue/SAA-810
