---
type: test-obligation
title: The companion base is tracked on every branch
description: >-
  An untracked base never reaches a pull request, which is the risk the reviewer
  raised.
tags:
  - review
  - process
generated:
  by: "agent:author"
  at: "2026-09-15T07:45:35.071Z"
verified:
  - by: unknown
    at: "2026-09-15T07:48:16.973Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
strauss_anchors:
  - file: .strauss/kb-pins.json
    hash: "sha256:6ebd0f7823c32a49ee6ecb1ee0bde0064041e4408233e87eeb763cd06fffe195"
    hash_kind: raw
    resolved_at: "2026-09-15T07:46:43.069Z"
    lines: 8
strauss_verify:
  - git ls-files --error-unmatch .strauss/kb/log.jsonl
strauss_links:
  - target: risk.kb-companion-untracked-not-on-branch
    rel: satisfies
strauss_status: open
---

## Obligation

`.strauss/kb` and `.strauss/kb-pins.json` are committed; a branch that changes records commits them.

## Why it matters

Reviewers and CI read the base from the branch, not from one machine.

## How to verify

git ls-files --error-unmatch .strauss/kb/log.jsonl exits 0.

Satisfies [risk.kb-companion-untracked-not-on-branch](risk.kb-companion-untracked-not-on-branch.md).
