---
type: decision
title: >-
  git-guard and code-diff are scaffolded by hand on strauss-kb's library shape,
  and typecheck now builds dependencies first
description: >-
  The nx-plugin generators make MCP servers and agent plugins; there is no
  library generator. strauss-kb's typecheck resolves a workspace dependency's
  types from its built dist.
tags:
  - review
sources:
  - id: agents-md
    resource: AGENTS.md#rules-that-are-load-bearing
generated:
  by: mcp
  at: "2026-09-15T15:31:48.823Z"
verified:
  - by: "agent:correctness"
    at: "2026-09-15T15:46:25.505Z"
    note: >-
      nx.json typecheck gains dependsOn ^build; both packages start at 0.1.0 on
      workspace:0.x; build and tests ran clean with --skip-nx-cache.
strauss_anchors:
  - file: nx.json
    hash: "sha256:b42c709daab9257587acb71115aadac49b0edb9343e8674f03c2c275075ec670"
    hash_kind: raw
    resolved_at: "2026-09-15T15:32:38.096Z"
    lines: 92
  - file: packages/git-guard/tsconfig.json
    hash: "sha256:3831b770ad81c8e4bcd707dbbe1955b8986ab9b77d7d3b280254e9de69f66b8c"
    hash_kind: raw
    resolved_at: "2026-09-15T15:32:38.097Z"
    lines: 8
  - file: packages/git-guard/tsup.config.ts
    hash: "sha256:62d510a7bf3b80322634756ca48d90805fd8ead6e978aa745af27adc2dafccbe"
    hash_kind: raw
    resolved_at: "2026-09-15T15:32:38.097Z"
    lines: 14
  - file: packages/git-guard/vitest.config.ts
    hash: "sha256:27abcba5bd8124cf72cc77832c32fd55b63e8236adf3f28967b66bf002f41b92"
    hash_kind: raw
    resolved_at: "2026-09-15T15:32:38.097Z"
    lines: 9
  - file: packages/git-guard/eslint.config.js
    hash: "sha256:67ebd6c8b1e08373d6871ed0d0dc1d3866394502a4c391ce32a453d62b7e17b2"
    hash_kind: raw
    resolved_at: "2026-09-15T15:32:38.097Z"
    lines: 12
  - file: packages/code-diff/tsconfig.json
    hash: "sha256:3831b770ad81c8e4bcd707dbbe1955b8986ab9b77d7d3b280254e9de69f66b8c"
    hash_kind: raw
    resolved_at: "2026-09-15T15:32:38.097Z"
    lines: 8
  - file: packages/code-diff/tsup.config.ts
    hash: "sha256:62d510a7bf3b80322634756ca48d90805fd8ead6e978aa745af27adc2dafccbe"
    hash_kind: raw
    resolved_at: "2026-09-15T15:32:38.097Z"
    lines: 14
  - file: packages/code-diff/vitest.config.ts
    hash: "sha256:27abcba5bd8124cf72cc77832c32fd55b63e8236adf3f28967b66bf002f41b92"
    hash_kind: raw
    resolved_at: "2026-09-15T15:32:38.097Z"
    lines: 9
  - file: packages/code-diff/eslint.config.js
    hash: "sha256:67ebd6c8b1e08373d6871ed0d0dc1d3866394502a4c391ce32a453d62b7e17b2"
    hash_kind: raw
    resolved_at: "2026-09-15T15:32:38.097Z"
    lines: 12
  - file: packages/git-guard/test/repo.ts
    symbol: tempRepo
    hash: "sha256:975b4a81d2e6a7b90d6409a4a870be050254de293571cf2afbafee42105f43f2"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:38.107Z"
    lines: 37
    resolver: tree-sitter
  - file: packages/code-diff/test/repo.ts
    symbol: tempRepo
    hash: "sha256:1768fd30a0755b8cbc90dd92a18217ff4f9a68f6fd71cbf6d83bbbd21e974034"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:38.111Z"
    lines: 37
    resolver: tree-sitter
  - file: packages/code-diff/src/index.ts
    hash: "sha256:8a9a7d3fe8850737e61e7e7b4e99e4be4538cbda7c0c221e5203c45074811066"
    hash_kind: raw
    resolved_at: "2026-09-15T15:32:38.111Z"
    lines: 18
  - file: packages/code-diff/src/classify/index.ts
    hash: "sha256:0b07ff2182d050008ef7bfcc14811a58af8a13779adcc29ebef479e1cca60753"
    hash_kind: raw
    resolved_at: "2026-09-15T15:32:38.111Z"
    lines: 24
  - file: packages/code-diff/src/repo/index.ts
    hash: "sha256:846487e946e2fddd691e9bf7764a99a7a7b948dcd3c4cb1797502cab85406d8b"
    hash_kind: raw
    resolved_at: "2026-09-15T15:32:38.111Z"
    lines: 13
strauss_status: accepted
---

## Decision

git-guard and code-diff are scaffolded by hand on strauss-kb's library shape, and typecheck now builds dependencies first

## Rationale

The nx-plugin generators make MCP servers and agent plugins; there is no library generator. strauss-kb's typecheck resolves a workspace dependency's types from its built dist.

## Rejected

The mcp-server generator with the server parts deleted; or tsconfig path mapping to source, which would typecheck against a shape the published package never has.

## Impact

Both packages copy strauss-kb's tsup (ESM+CJS, dts), tsconfig, vitest and eslint configs, start at 0.1.0 and depend on each other as workspace:0.x. nx.json's typecheck gains dependsOn ^build. Each package carries its own test/repo.ts, a temp repository isolated from the host git config.

[^agents-md]: AGENTS.md#rules-that-are-load-bearing
