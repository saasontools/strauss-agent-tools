---
type: risk
title: >-
  A macro the base defines, applied from .git/info/attributes, lowers a pinned
  read with no note
description: >-
  The local-file guard matches class attribute names as text; a base-defined
  macro sets linguist-generated without naming it.
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-15T16:36:16.560Z"
verified: []
strauss_anchors:
  - file: packages/git-guard/src/check-attr.ts
    symbol: namesAttribute
    hash: "sha256:f840e1b6d9811610b328c26c4582bfb2fb8a23d422cee12a38e945ae66fe963e"
    hash_kind: ast
    resolved_at: "2026-09-15T16:49:47.421Z"
    lines: 27
    resolver: tree-sitter
  - file: packages/code-diff/src/classify/attributes.ts
    symbol: readAttributes
    hash: "sha256:88b811772b45f7da10219f8ad4b8cc6514fad0230bce4548ab2eac4dd5c31765"
    hash_kind: ast
    resolved_at: "2026-09-15T16:47:30.819Z"
    lines: 29
    resolver: tree-sitter
strauss_links:
  - target: decision.local-attribute-files-unpin-the-read
    rel: informs
  - target: test-obligation.local-attribute-files-never-lower
    rel: informs
strauss_status: open
strauss_materiality: important
strauss_confidence: high
---

## Risk

namesAttribute unpins only when info/attributes contains a requested attribute name. check-attr expands a macro defined in the base tree's root .gitattributes for info/attributes lines too. Reproduced on git 2.50.1: base .gitattributes `[attr]skip linguist-generated -diff` and `*.lock skip`; the clone's .git/info/attributes `* skip`; classifyFiles(root, [src/a.ts], { base: 'HEAD~1' }) returns `generated (attribute linguist-generated)` with no note, and checkAttr reports pinned: true, local: false. Without the local line, src/a.ts is source.

## Why it matters

decision.local-attribute-files-unpin-the-read rejects ignoring local files because one untracked line lowers every changed file, and test-obligation.local-attribute-files-never-lower says a local file never lowers. In a repo whose base defines such a macro, that one line still marks every changed file generated, which the gate's SKIPPED set exempts from uncovered.

## Mitigation

None in the diff. Count as local an info/attributes line that names a macro the base's root .gitattributes defines over a class attribute (the probe already reads that blob), or unpin whenever info/attributes assigns any attribute.

## Verification

A check-attr.spec or attributes.spec case: base root .gitattributes `[attr]skip linguist-generated`, info/attributes `* skip`; expects pinned false and the local-file note.

Informs [decision.local-attribute-files-unpin-the-read](decision.local-attribute-files-unpin-the-read.md).

Informs [test-obligation.local-attribute-files-never-lower](test-obligation.local-attribute-files-never-lower.md).
