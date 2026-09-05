---
type: fact
title: Protocol types are generated from src/protocol/protocol.json
description: >-
  Reading the generated file by eye finds nothing the generator did not intend,
  and hides the one line that did change: the input.
tags:
  - review
  - 'review:generated'
generated:
  by: 'agent:impl'
  at: '2026-09-01T09:08:00.000Z'
verified: []
strauss_anchors:
  - file: src/protocol/generated/index.ts
  - file: src/protocol/protocol.json
strauss_verify:
  - 'pnpm gen:protocol && git diff --exit-code src/protocol/generated'
strauss_status: accepted
---
## Claim

Every line of src/protocol/generated/index.ts is output of scripts/gen-protocol.mjs.

## Evidence

The file's header names the generator, the input path, and the input's sha256.
