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
strauss_anchors:
  - file: packages/git-guard/src/check-attr.ts
    symbol: checkAttr
    hash: "sha256:f76a2bb7649052f3a3a2d1557e5497b20b26f7990add8ba0ada0407d1bd7a0f5"
    hash_kind: ast
    resolved_at: "2026-09-15T16:22:26.402Z"
    lines: 64
    resolver: tree-sitter
  - file: packages/git-guard/src/check-attr.ts
    symbol: namesAttribute
    hash: "sha256:7710a737d3a18110b14609ccfa8b5bcae7d9b149c768d6de6a2fc02f4c513fd7"
    hash_kind: ast
    resolved_at: "2026-09-15T16:22:26.404Z"
    lines: 16
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
    hash: "sha256:590620e3baaed919303e2c720e84415834c6e9e9a67ca156bb73dea82e0999ef"
    hash_kind: ast
    resolved_at: "2026-09-15T16:22:26.408Z"
    lines: 19
    resolver: tree-sitter
strauss_status: accepted
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
