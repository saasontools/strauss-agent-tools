---
type: test-obligation
title: >-
  Changed symbols name TenantService.findMany and ReportBuilder.fromCharge on
  the companion fixture
description: >-
  SAA-810 names silent-code-change and excluded-path-crosses as the scenarios
  that pin the parse-based answer.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-15T15:29:48.231Z"
verified:
  - by: "agent:correctness"
    at: "2026-09-15T15:46:26.223Z"
    note: >-
      Ran both commands: code-diff 98 passed and strauss-kb changed-symbols.spec
      passed; the fixture cases assert the named symbols and via.
  - by: "agent:correctness"
    at: "2026-09-15T16:12:10.231Z"
    note: >-
      At 8f85584: strauss-kb src/changed-symbols.spec.ts passed 3; code-diff
      src/changed-symbols.spec.ts passed 13.
strauss_anchors:
  - file: packages/strauss-kb/src/changed-symbols.spec.ts
    hash: "sha256:ad1ed3d553038a9e8a958ba4cd96bef4b3ef112d3e1336917e5f18513c32dfc1"
    hash_kind: raw
    resolved_at: "2026-09-15T15:32:33.623Z"
    lines: 85
strauss_status: open
---

## Obligation

Over main...silent-code-change every hunk sits in TenantService.findMany; over main...excluded-path-crosses the import is file scope and the added method is ReportBuilder.fromCharge, both named by the parse; a file with no grammar is named by git's function context.

## Why it matters

git's funcname line names ReportBuilder for the method hunk and the nearest preceding declaration for a file-scope one.

## How to verify

cd packages/strauss-kb && pnpm vitest run src/changed-symbols.spec.ts; cd packages/code-diff && pnpm vitest run src/changed-symbols.spec.ts
