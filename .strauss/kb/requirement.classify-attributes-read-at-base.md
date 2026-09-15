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
  - by: "agent:performance"
    at: "2026-09-15T15:47:10.761Z"
    note: >-
      checkAttr passes every path on stdin -z in one spawn; a second runs only
      on git's own failure. 124 range paths at c5e9a66: 41.6 ms median on this
      machine.
strauss_anchors:
  - file: packages/code-diff/src/classify/attributes.ts
    symbol: readAttributes
    hash: "sha256:88b811772b45f7da10219f8ad4b8cc6514fad0230bce4548ab2eac4dd5c31765"
    hash_kind: ast
    resolved_at: "2026-09-15T16:22:37.428Z"
    lines: 29
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
