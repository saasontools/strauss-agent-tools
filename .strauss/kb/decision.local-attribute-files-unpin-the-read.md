---
type: decision
title: >-
  Global and system attribute files are switched off; a class named in the
  clone's info/attributes unpins the read
description: >-
  check-attr --source still applies attribute files outside the tree. git
  switches two of them off — core.attributesFile with an empty -c, the system
  file with GIT_ATTR_NOSYSTEM — but has no switch for $GIT_DIR/info/attributes.
tags:
  - review
  - "review:security"
generated:
  by: mcp
  at: "2026-09-15T16:21:37.482Z"
verified:
  - by: unknown
    at: "2026-09-15T16:22:40.743Z"
    note: "anchor-resolve: 4/4 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:22:48.055Z"
    note: "anchor-resolve: 4/4 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:25:34.335Z"
    note: "anchor-resolve: 4/4 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:35:43.396Z"
    note: "anchor-resolve: 4/4 anchors match (tree-sitter resolver)"
strauss_anchors:
  - file: packages/git-guard/src/check-attr.ts
    symbol: checkAttr
    hash: "sha256:4fe0d8345781772daaaa95bf1248cee1cd5c7f0382d498c45c3536ac85ee0b3b"
    hash_kind: ast
    resolved_at: "2026-09-15T16:49:56.934Z"
    lines: 66
    resolver: tree-sitter
  - file: packages/git-guard/src/check-attr.ts
    symbol: namesAttribute
    hash: "sha256:f840e1b6d9811610b328c26c4582bfb2fb8a23d422cee12a38e945ae66fe963e"
    hash_kind: ast
    resolved_at: "2026-09-15T16:49:56.937Z"
    lines: 27
    resolver: tree-sitter
  - file: packages/git-guard/src/run.ts
    symbol: runGit
    hash: "sha256:ee8353561b2bee5fc2cf41ac9b43fd503ddd499ef8f87aed33430212b8b1cce9"
    hash_kind: ast
    resolved_at: "2026-09-15T16:22:26.406Z"
    lines: 37
    resolver: tree-sitter
  - file: packages/code-diff/src/classify/read.ts
    symbol: notesFor
    hash: "sha256:954dc8823edbaf66e6219e137444f092740b2bc22fe4067faaad6e6315b1943a"
    hash_kind: ast
    resolved_at: "2026-09-15T16:47:40.140Z"
    lines: 21
    resolver: tree-sitter
strauss_status: superseded
strauss_superseded_by: decision.local-attribute-file-lowers-nothing
---

## Decision

Global and system attribute files are switched off; a class named in the clone's info/attributes unpins the read

## Rationale

check-attr --source still applies attribute files outside the tree. git switches two of them off — core.attributesFile with an empty -c, the system file with GIT_ATTR_NOSYSTEM — but has no switch for $GIT_DIR/info/attributes.

## Rejected

Matching .gitattributes patterns ourselves from blobs at the base: a second implementation of git's pattern rules to keep in step. Or ignoring local files: one untracked line lowers every changed file.

## Impact

checkAttr always runs with `-c core.attributesFile=` and GIT_ATTR_NOSYSTEM=1, and for a pinned read reads the file `rev-parse --git-path info/attributes` names. If it mentions a requested attribute the read comes back unpinned with local set, and code-diff keeps only strauss-class=source and notes the local file. A clone with an unrelated info/attributes is unaffected.

Relates to [risk.pinned-attribute-read-honours-local-attribute-files](risk.pinned-attribute-read-honours-local-attribute-files.md).

Relates to [requirement.classify-attributes-read-at-base](requirement.classify-attributes-read-at-base.md).
