---
type: decision
title: "The guarded git runner is its own package, git-guard, not part of code-diff"
description: >-
  SAA-810 asked to count the git call sites first and cut a git-guard package if
  more than a couple of strauss-kb's wanted the same runner. Three did:
  drift/git.ts (cat-file, ls-files, log, the range diff), remote-repo/git.ts
  (init, config, fetch, rev-parse, update-ref; validate.ts's check-ref-format)
  and anchor-resolver/repo-identity.ts (config --get remote.origin.url).
  kb-gitattributes.ts and the sweep spawn nothing. In the plugin,
  hooks/scripts/lib/git.mjs spawns git and check-attr; lib/urls.mjs spawns curl
  and lib/cli.mjs the strauss-kb CLI; no walkthrough or merge-policy script
  exists yet.
tags:
  - review
sources:
  - id: saa-810
    resource: "https://linear.app/saason/issue/SAA-810"
generated:
  by: mcp
  at: "2026-09-15T15:31:04.234Z"
verified:
  - by: unknown
    at: "2026-09-15T15:33:09.370Z"
    note: "anchor-resolve: 12/12 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:34:50.960Z"
    note: "anchor-resolve: 12/12 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:37:41.435Z"
    note: "anchor-resolve: 12/12 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:38:12.821Z"
    note: "anchor-resolve: 12/12 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:45:14.756Z"
    note: "anchor-resolve: 12/12 anchors match (tree-sitter resolver)"
  - by: "agent:security"
    at: "2026-09-15T15:45:43.472Z"
    note: >-
      grep of strauss-kb, code-diff and git-guard src: git-guard run.ts runGit
      is the only execFile; drift/git.ts, remote-repo/git.ts and
      repo-identity.ts call runGit/showAtRev, and shape checks import from
      git-guard. repo-identity's config read gains the env strip it lacked.
  - by: "agent:correctness"
    at: "2026-09-15T15:46:24.375Z"
    note: >-
      drift/git.ts git and catBlob, remote-repo/git.ts git, repoOriginUrl and
      validate.ts's shape checks all route through @saasontools/git-guard;
      code-diff depends only on git-guard.
  - by: "agent:performance"
    at: "2026-09-15T15:47:11.641Z"
    note: >-
      Checked limits only: drift 5 s/1 MiB, catBlob via showAtRev with the same,
      remote-repo 30 s/MAX_ANCHOR_FILE_BYTES, repo-identity 5 s; runGit sets
      timeout and maxBuffer on every spawn.
  - by: unknown
    at: "2026-09-15T15:48:09.681Z"
    note: "anchor-resolve: 12/12 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:49:20.358Z"
    note: "anchor-resolve: 12/12 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:02:37.488Z"
    note: "anchor-resolve: 12/12 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:04:28.305Z"
    note: "anchor-resolve: 12/12 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:06:27.626Z"
    note: "anchor-resolve: 12/12 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:13:10.616Z"
    note: "anchor-resolve: 12/12 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:22:47.392Z"
    note: "anchor-resolve: 12/12 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:25:33.681Z"
    note: "anchor-resolve: 12/12 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:35:42.751Z"
    note: "anchor-resolve: 12/12 anchors match (tree-sitter resolver)"
strauss_anchors:
  - file: packages/git-guard/src/run.ts
    symbol: runGit
    hash: "sha256:ee8353561b2bee5fc2cf41ac9b43fd503ddd499ef8f87aed33430212b8b1cce9"
    hash_kind: ast
    resolved_at: "2026-09-15T16:22:37.005Z"
    lines: 37
    resolver: tree-sitter
  - file: packages/git-guard/src/shape.ts
    symbol: localRevShapeIsSafe
    hash: "sha256:e590f4415c9afa9cc701ab51861e71a2b6d81f51d184e28a3156a49716eebe12"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:35.711Z"
    lines: 5
    resolver: tree-sitter
  - file: packages/git-guard/src/show.ts
    symbol: showAtRev
    hash: "sha256:ccf96b5080f69ca1766f8940828082a2e793e1b5a0cb739418dc9f6f11d9820d"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:35.714Z"
    lines: 14
    resolver: tree-sitter
  - file: packages/git-guard/src/index.ts
    hash: "sha256:7790fe4a1945c135773357a32de363f0154602f2240d0f27fb6410f6fddd3c20"
    hash_kind: raw
    resolved_at: "2026-09-15T15:32:35.714Z"
    lines: 21
  - file: packages/strauss-kb/src/drift/git.ts
    symbol: git
    hash: "sha256:f8ba42788a1e7a1f026f9cb23d0b72dcf37f31ca81c9a5845e2f79f28b8702cc"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:35.718Z"
    lines: 9
    resolver: tree-sitter
  - file: packages/strauss-kb/src/drift/git.ts
    symbol: catBlob
    hash: "sha256:4a7cce4b51cc5120fbbe508f8a5323db8b3f4e481afdc1a124ae40ebbbe35bdd"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:35.718Z"
    lines: 10
    resolver: tree-sitter
  - file: packages/strauss-kb/src/remote-repo/git.ts
    symbol: git
    hash: "sha256:18bbbe9ab8b41b48dd12acc4d825a9634d4614765e90d5bf8cd33d384a181bb9"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:35.720Z"
    lines: 16
    resolver: tree-sitter
  - file: packages/strauss-kb/src/remote-repo/validate.ts
    symbol: refIsWellFormed
    hash: "sha256:154428829f5f1847267792aa42737135510d2373fd5540655e3b30d66a2ef2eb"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:35.721Z"
    lines: 5
    resolver: tree-sitter
  - file: packages/strauss-kb/src/remote-repo/read.ts
    symbol: readRemoteAnchors
    hash: "sha256:bf5ac61d2feb56acc3fa93879f6f5ab0e3f7fad317665354cdaeb02ead107e4d"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:35.729Z"
    lines: 33
    resolver: tree-sitter
  - file: packages/strauss-kb/src/anchor-resolver/repo-identity.ts
    symbol: repoOriginUrl
    hash: "sha256:4b56b4dc6f17db01b83ed05ebaaa2c95d9acdc09789be0e4718e0b717f6e7adb"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:35.730Z"
    lines: 7
    resolver: tree-sitter
  - file: packages/code-diff/package.json
    hash: "sha256:c092edc0595cd94c97fcab272bf57ec922b7c1a40c91a562ab4896738cd69fd8"
    hash_kind: raw
    resolved_at: "2026-09-15T15:32:35.730Z"
    lines: 58
  - file: packages/strauss-kb/package.json
    hash: "sha256:0f7fdadd296528e7dffa6ba5b6176b7fa38827d71466bf2d9f6bbedb4109d87f"
    hash_kind: raw
    resolved_at: "2026-09-15T15:32:35.730Z"
    lines: 80
strauss_links:
  - target: requirement.cli-mcp-unchanged-except-classify
    rel: satisfies
strauss_status: accepted
---

## Decision

The guarded git runner is its own package, git-guard, not part of code-diff

## Rationale

SAA-810 asked to count the git call sites first and cut a git-guard package if more than a couple of strauss-kb's wanted the same runner. Three did: drift/git.ts (cat-file, ls-files, log, the range diff), remote-repo/git.ts (init, config, fetch, rev-parse, update-ref; validate.ts's check-ref-format) and anchor-resolver/repo-identity.ts (config --get remote.origin.url). kb-gitattributes.ts and the sweep spawn nothing. In the plugin, hooks/scripts/lib/git.mjs spawns git and check-attr; lib/urls.mjs spawns curl and lib/cli.mjs the strauss-kb CLI; no walkthrough or merge-policy script exists yet.

## Rejected

The runner inside code-diff: remote-repo and repo-identity would then depend on a diff package to fetch a remote or read one config value, and the shape checks would live in two places.

## Impact

strauss-kb's three runners and the ref/path shape checks go through git-guard; code-diff depends on it; strauss-kb depends on both. The plugin's lib/git.mjs keeps its copy until SAA-813. Environment and output limits are unified — see decision.git-env-strips-redirects-only.

Satisfies [requirement.cli-mcp-unchanged-except-classify](requirement.cli-mcp-unchanged-except-classify.md).

[^saa-810]: https://linear.app/saason/issue/SAA-810
