---
type: decision
title: >-
  Global and system attribute files are switched off; any attribute in the
  clone's info/attributes makes every file source
description: >-
  check-attr --source still applies attribute files outside the tree. git
  switches two off — core.attributesFile with an empty -c, the system file with
  GIT_ATTR_NOSYSTEM — but has no switch for $GIT_DIR/info/attributes, where a
  macro or an unset lowers without naming a class.
tags:
  - review
  - "review:security"
generated:
  by: mcp
  at: "2026-09-15T16:46:56.666Z"
verified:
  - by: "agent:author"
    at: "2026-09-15T16:47:44.576Z"
    note: "anchor-resolve: 4/4 anchors match (tree-sitter resolver)"
strauss_anchors:
  - file: packages/git-guard/src/check-attr.ts
    symbol: checkAttr
    hash: "sha256:aba399499154a15bc8b6b37031ee8ee8496c8610b1408b01e0e8f23955ee129a"
    hash_kind: ast
    resolved_at: "2026-09-15T16:47:26.717Z"
    lines: 66
    resolver: tree-sitter
  - file: packages/git-guard/src/check-attr.ts
    symbol: hasLocalAttributes
    hash: "sha256:1cebde041b52a6cc4bf28dfe93f194f7de5c2bd39592bb358ceb53e8f704a871"
    hash_kind: ast
    resolved_at: "2026-09-15T16:47:26.721Z"
    lines: 27
    resolver: tree-sitter
  - file: packages/code-diff/src/classify/read.ts
    symbol: classifyFiles
    hash: "sha256:8b44adb4e92bf9f4dc931dc4b8ef19a0d9130b99f19962a9b8189d19a1c5cf4a"
    hash_kind: ast
    resolved_at: "2026-09-15T16:47:26.723Z"
    lines: 38
    resolver: tree-sitter
  - file: packages/code-diff/src/classify/read.ts
    symbol: notesFor
    hash: "sha256:954dc8823edbaf66e6219e137444f092740b2bc22fe4067faaad6e6315b1943a"
    hash_kind: ast
    resolved_at: "2026-09-15T16:47:26.723Z"
    lines: 21
    resolver: tree-sitter
strauss_status: accepted
strauss_supersedes:
  - decision.local-attribute-files-unpin-the-read
---

## Decision

Global and system attribute files are switched off; any attribute in the clone's info/attributes makes every file source

## Rationale

check-attr --source still applies attribute files outside the tree. git switches two off — core.attributesFile with an empty -c, the system file with GIT_ATTR_NOSYSTEM — but has no switch for $GIT_DIR/info/attributes, where a macro or an unset lowers without naming a class.

## Rejected

Unpinning only when info/attributes names a class attribute: `* !strauss-class` dropped a base pin, and a base-defined macro lowered with the read still pinned. Or matching .gitattributes patterns ourselves from blobs at the base: a second implementation of git's pattern rules.

## Impact

checkAttr reads info/attributes first — no symlink, non-blocking, regular files only, bounded — and if any line sets an attribute it returns unpinned and local without spawning check-attr; classifyFiles then gives every file source, whatever the declarations, with a note. A clone with any info/attributes line, even an unrelated one, gets full review.

Relates to [risk.pinned-attribute-read-honours-local-attribute-files](risk.pinned-attribute-read-honours-local-attribute-files.md).

Relates to [risk.local-attribute-unset-drops-base-source-pin](risk.local-attribute-unset-drops-base-source-pin.md).

Relates to [risk.attribute-macro-in-info-attributes-lowers-pinned-read](risk.attribute-macro-in-info-attributes-lowers-pinned-read.md).
