---
type: risk
title: >-
  An unpinned .gitattributes read still lowers classes: the branch's own
  attributes decide when the base cannot be read
description: >-
  A change can mark its own files generated, docs or test and pass the gate's
  uncovered check wherever the base pin silently fails.
tags:
  - review
  - "review:security"
generated:
  by: "agent:security"
  at: "2026-09-15T15:44:54.571Z"
strauss_anchors:
  - file: packages/git-guard/src/check-attr.ts
    symbol: checkAttr
    hash: "sha256:4fe0d8345781772daaaa95bf1248cee1cd5c7f0382d498c45c3536ac85ee0b3b"
    hash_kind: ast
    resolved_at: "2026-09-15T16:49:58.009Z"
    lines: 66
    resolver: tree-sitter
  - file: packages/code-diff/src/classify/read.ts
    symbol: classifyFiles
    hash: "sha256:8b44adb4e92bf9f4dc931dc4b8ef19a0d9130b99f19962a9b8189d19a1c5cf4a"
    hash_kind: ast
    resolved_at: "2026-09-15T16:47:41.841Z"
    lines: 38
    resolver: tree-sitter
strauss_links:
  - target: requirement.classify-attributes-read-at-base
    rel: informs
strauss_status: open
strauss_materiality: important
strauss_confidence: high
---

## Risk

git-guard checkAttr retries without --source on any `failed` exit (git < 2.40 rejecting the option, or a base rev that does not resolve) and returns the working tree's attributes. classifyFiles hands them to classifyDiff unchanged, so the head's linguist-generated, linguist-documentation and strauss-class=test|ci|config|lockfile apply. The only signal is `notes`; the review hook's cliRows (lib/classify.mjs) reads files[].class and drops notes. kb_classify with `base` omitted reads the working tree the same way. The hook's own lib/git.mjs checkAttr falls back identically, so neither layer holds the pin.

## Why it matters

requirement.classify-attributes-read-at-base exists so a branch cannot lower its own review. A branch adding `src/** linguist-generated` gets `generated`, which the gate's SKIPPED set exempts from `uncovered`.

## Mitigation

None beyond the note. Suggested: when a base was asked for and the read comes back unpinned, keep only verdicts that raise scrutiny (strauss-class=source) or return no attributes; tell an unknown --source option apart from an unresolvable rev.

## Verification

git-guard check-attr.spec.ts 'a source git cannot read falls back to the working tree' asserts head's linguist-generated for source no-such-branch.

Informs [requirement.classify-attributes-read-at-base](requirement.classify-attributes-read-at-base.md).
