---
type: risk
title: >-
  A pinned check-attr read still applies .git/info/attributes and
  core.attributesFile, so a local file lowers classes with no note
description: >-
  readAttributes treats pinned as read at the base; git's --source only swaps
  the tree's .gitattributes.
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-15T16:12:09.516Z"
verified:
  - by: unknown
    at: "2026-09-15T16:22:53.930Z"
    note: "anchor-resolve: 2/2 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:25:39.611Z"
    note: "anchor-resolve: 2/2 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:35:49.816Z"
    note: "anchor-resolve: 2/2 anchors match (tree-sitter resolver)"
  - by: "agent:author"
    at: "2026-09-15T16:48:05.878Z"
    note: "anchor-resolve: 2/2 anchors match (tree-sitter resolver)"
strauss_anchors:
  - file: packages/git-guard/src/check-attr.ts
    symbol: checkAttr
    hash: "sha256:4fe0d8345781772daaaa95bf1248cee1cd5c7f0382d498c45c3536ac85ee0b3b"
    hash_kind: ast
    resolved_at: "2026-09-15T16:49:58.645Z"
    lines: 66
    resolver: tree-sitter
  - file: packages/code-diff/src/classify/attributes.ts
    symbol: readAttributes
    hash: "sha256:88b811772b45f7da10219f8ad4b8cc6514fad0230bce4548ab2eac4dd5c31765"
    hash_kind: ast
    resolved_at: "2026-09-15T16:22:39.155Z"
    lines: 29
    resolver: tree-sitter
strauss_links:
  - target: requirement.classify-attributes-read-at-base
    rel: informs
  - target: test-obligation.classify-lowers-only-on-pinned-read
    rel: informs
strauss_status: open
strauss_materiality: important
strauss_confidence: high
---

## Risk

checkAttr passes --source=<base>, but git check-attr still reads $GIT_DIR/info/attributes, core.attributesFile (~~/.config/git/attributes by default) and the system file. It reports pinned: true, so readAttributes applies attributeVerdict in full. Reproduced on git 2.50.1: a repo with no .gitattributes, `* linguist-generated` written to .git/info/attributes, then classifyFiles(root, [src/b.spec.ts], { base: 'main~~1' }) returns generated (attribute linguist-generated) with no notes. declaresClasses reads only tree blobs, so the probe cannot see the local file.

## Why it matters

requirement.classify-attributes-read-at-base says a change cannot reclassify its own files, and the gate's SKIPPED set exempts generated from uncovered. The author's checkout is where the Stop hook runs classify. One untracked file, outside the diff and outside the base, turns every changed file generated. The hook's lib/git.mjs has the same gap; this range is what claims the read is pinned.

## Mitigation

None in the diff. Run check-attr with -c core.attributesFile= and GIT_ATTR_NOSYSTEM=1. Refuse a pinned answer, or add a note, when $GIT_DIR/info/attributes names a class attribute. Or read attributes through a scratch git dir that borrows the repository's objects through alternates.

## Verification

An attributes.spec case that writes .git/info/attributes with `* linguist-generated` and expects source, or a note, for a base-pinned read.

Informs [requirement.classify-attributes-read-at-base](requirement.classify-attributes-read-at-base.md).

Informs [test-obligation.classify-lowers-only-on-pinned-read](test-obligation.classify-lowers-only-on-pinned-read.md).
