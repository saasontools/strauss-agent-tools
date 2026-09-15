---
type: open-question
title: >-
  Does classify lower a class only on evidence read at the base, as
  flow.classify-a-range-at-base says, when a banner the branch adds makes a file
  generated?
description: The flow's title and requirement.classify-attributes-read-at-base rest on it.
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-15T16:36:16.893Z"
verified: []
strauss_anchors:
  - file: packages/code-diff/src/classify/classify.ts
    symbol: classifyFile
    hash: "sha256:29ba8b9893a3bdadc24ad544909a0adba224eeb79f938fc837a81a77ff311a9c"
    hash_kind: ast
    resolved_at: "2026-09-15T16:47:29.578Z"
    lines: 29
    resolver: tree-sitter
strauss_links:
  - target: flow.classify-a-range-at-base
    rel: informs
  - target: requirement.classify-attributes-read-at-base
    rel: informs
strauss_status: resolved
strauss_answered:
  by: mcp
  at: "2026-09-15T16:46:38.309Z"
strauss_owner: mcp
---

## Question

classifyFile takes banner(file) before the path table, and classifyFiles reads the banner from the working tree, which holds head. Reproduced: base with a root .gitattributes; the branch adds `// @generated` as line 1 of src/c.ts, source at base; classifyFiles at HEAD~1 returns `generated (generated-header @generated)`. attributes.spec 'attribute, banner, then source' shows the same for a file head adds. Is a head banner an accepted exception, or should it lower only when the base's copy carries it?

## Why it matters

generated is in the hook's SKIPPED set, so one comment line exempts a branch's own file from uncovered: the case the requirement closes for attributes.

## Default assumption

The banner is an unrecorded exception: the flow's title overclaims, and a head banner lowers a class.

Informs [flow.classify-a-range-at-base](flow.classify-a-range-at-base.md).

Informs [requirement.classify-attributes-read-at-base](requirement.classify-attributes-read-at-base.md).

## Answer

An accepted exception. Reading the banner at the base only would leave every new generated file source and let a banner removed on the branch still lower. The banner is in the diff, a base strauss-class=source outranks it, and a local attributes file turns it off. decision.branch-banner-is-a-declaration records it; risk.branch-banner-lowers-its-own-file stays open for its reviewer.
