---
type: decision
title: Retire the test-obligation type; an author answers a risk in the rerun brief
description: >-
  A record belongs in the base only if it is still true after merge; a
  test-obligation was a reply to a reviewer's risk stored as knowledge.
sources:
  - id: saa-823
    resource: >-
      https://linear.app/saason/issue/SAA-823/retire-the-test-obligation-record-type
generated:
  by: "agent:author"
  at: "2026-09-18T21:24:17.041Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/record-types.ts
    symbol: RETIRED_RECORD_TYPES
    hash: "sha256:215d809e908ced80b652d3e48bceb7ebbe793500363a376e6281fe7b7f103c91"
    hash_kind: raw
    resolved_at: "2026-09-18T21:24:51.657Z"
    lines: 4
    resolver: regex
  - file: packages/strauss-kb/src/commands/write.ts
    symbol: writeCommand
    hash: "sha256:39a332e1f46cc4aa8c009ed0ae31f2785a4c2a0be8203c639ab8339e711ce106"
    hash_kind: raw
    resolved_at: "2026-09-18T21:24:51.658Z"
    lines: 34
    resolver: regex
  - file: packages/strauss-kb/src/commands/types.ts
    symbol: typesCommand
    hash: "sha256:22c6e83e4dc6f829a3f86fbd2b896bada44a0417ac3e91410de24a65099d4849"
    hash_kind: raw
    resolved_at: "2026-09-18T21:24:51.659Z"
    lines: 10
    resolver: regex
  - file: plugins/strauss-kb-review/hooks/scripts/lib/checks/owed.mjs
    symbol: verification
    hash: "sha256:669ba97c1d1e747983086f91bbcebcf8738efdceb9d76da53fd54e2c906c5a4f"
    hash_kind: ast
    resolved_at: "2026-09-18T21:24:51.664Z"
    lines: 14
    resolver: tree-sitter
  - file: plugins/strauss-kb-review/hooks/scripts/lib/checks/owed.mjs
    symbol: check
    hash: "sha256:a9afd2bf284aff2a908363ba17e22ef8ec5a61dbcfcf678dd287742db6746de2"
    hash_kind: ast
    resolved_at: "2026-09-18T21:24:51.665Z"
    lines: 18
    resolver: tree-sitter
  - file: plugins/strauss-kb-review/hooks/scripts/lib/checks/owed.mjs
    symbol: answered
    hash: "sha256:15f21e99c42c6c6cdf5aabaf055839b28d1d2b53b4f639d46b35ff5d14f59359"
    hash_kind: ast
    resolved_at: "2026-09-18T21:24:51.666Z"
    lines: 11
    resolver: tree-sitter
  - file: plugins/strauss-kb-review/hooks/scripts/lib/context.mjs
    symbol: memoBacklinks
    hash: "sha256:19f07378f89abad90a9626726de39dd576b14b529fe59efcd3c766385e036deb"
    hash_kind: ast
    resolved_at: "2026-09-18T21:24:51.670Z"
    lines: 9
    resolver: tree-sitter
  - file: >-
      fixtures/companion-repo/scenarios/blocking-risk/head/.strauss/kb/test-obligation.checkout-single-charge.md
strauss_status: accepted
---

## Decision

The test-obligation type is removed and a write of it is refused. An author answers a reviewer's risk in the rerun brief (fixed in a commit, answered, or left open with a reason), never in the base. owed.verification warns on an open blocking or important risk and never blocks; an unaddressed risk goes to the human through the PR body.

## Rationale

On PR 92 all 17 obligations were written beside tests that already existed, 14 of 14 verify commands passed at write time, and the three with no command could never close. The author had no other channel to the reviewer, so the base became one.

## Rejected

Narrowing the type to a test nobody wrote yet — the only three that fit could never close. Commit trailers discharging owed.verification when a test file moved — couples a risk to tests instead of to its Verification. A fact that satisfies the risk as the reply — the same message in another type. Blocking the author until the risk is addressed — an author that cannot fix it is stuck and the block propagates up.

## Impact

Breaking for any base holding a test-obligation: it reports as an unrecognised type until deleted. The reviewer settling its own risk is SAA-819; until then a human closes. A durable channel across sessions is SAA-825.

[^saa-823]: https://linear.app/saason/issue/SAA-823/retire-the-test-obligation-record-type
