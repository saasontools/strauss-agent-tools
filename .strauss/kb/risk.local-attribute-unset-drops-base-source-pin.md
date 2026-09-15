---
type: risk
title: >-
  A `* !strauss-class` line in .git/info/attributes drops the base's source pin,
  so a branch banner or fact lowers the file
description: The gate skips uncovered on a file the repository pinned as source.
tags:
  - review
  - "review:security"
generated:
  by: "agent:security"
  at: "2026-09-15T16:33:19.658Z"
verified: []
strauss_anchors:
  - file: packages/code-diff/src/classify/read.ts
    symbol: classifyFiles
    hash: "sha256:8f3ec93d579719f3cec76bbc91a2ed9a95649f6145ef9d31f762cb2b78fc6377"
    hash_kind: ast
    resolved_at: "2026-09-15T16:35:49.606Z"
    lines: 27
    resolver: tree-sitter
  - file: packages/code-diff/src/classify/attributes.ts
    symbol: readAttributes
    hash: "sha256:88b811772b45f7da10219f8ad4b8cc6514fad0230bce4548ab2eac4dd5c31765"
    hash_kind: ast
    resolved_at: "2026-09-15T16:35:49.610Z"
    lines: 29
    resolver: tree-sitter
  - file: packages/git-guard/src/check-attr.ts
    symbol: namesAttribute
    hash: "sha256:7710a737d3a18110b14609ccfa8b5bcae7d9b149c768d6de6a2fc02f4c513fd7"
    hash_kind: ast
    resolved_at: "2026-09-15T16:35:49.613Z"
    lines: 16
    resolver: tree-sitter
strauss_links:
  - target: decision.local-attribute-files-unpin-the-read
    rel: informs
  - target: test-obligation.source-pin-outranks-declarations
    rel: informs
strauss_status: open
strauss_materiality: important
strauss_confidence: high
---

## Risk

checkAttr runs check-attr --source=<base>, and git still applies $GIT_DIR/info/attributes on top. namesAttribute only flips pinned to false; readAttributes keeps strauss-class=source only where the combined read still reports it, and `!strauss-class` there removes it. classifyFile then has no pin, and a banner or review:* fact the branch added decides. Reproduced on the built dist: base `.gitattributes` `src/** strauss-class=source`, head prepends `// @generated` to src/a.ts. No local file: source (attribute strauss-class=source). With `* !strauss-class` in .git/info/attributes: generated (generated-header @generated), plus a note.

## Why it matters

The Stop hook runs classify in the author's clone, its cliRows drops notes, and generated is in SKIPPED. One untracked line undoes the pin test-obligation.source-pin-outranks-declarations holds.

## Mitigation

None in the diff. When `local` is set, lower nothing: every file source, banners, declarations and the table ignored. Or take the pin from the base's .gitattributes blobs, which the cat-file probe already fetches.

## Verification

None. An attributes.spec case with a base source pin, a head banner and `* !strauss-class` in info/attributes expects source.

Informs [decision.local-attribute-files-unpin-the-read](decision.local-attribute-files-unpin-the-read.md).

Informs [test-obligation.source-pin-outranks-declarations](test-obligation.source-pin-outranks-declarations.md).
