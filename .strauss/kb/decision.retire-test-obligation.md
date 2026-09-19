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
verified:
  - by: "agent:prose"
    at: "2026-09-19T06:10:49.369Z"
    note: >-
      prose surfaces: git grep finds test-obligation only in the retired-type
      message, the version plan and KB records; docs, README, skills and the
      kb_types description all drop it and read eleven
  - by: "agent:security"
    at: "2026-09-19T06:11:24.659Z"
    note: >-
      Read owed.mjs verification at head: severity hard-coded warn, no backlink
      spawn. Ran write test-obligation: refused with the replacement message.
      Ran constructor/__proto__/toString: refused with zod's default message, no
      throw.
  - by: "agent:performance"
    at: "2026-09-19T06:17:43.203Z"
    note: >-
      performance: owed.verification no longer calls ctx.backlinks; owed.mjs:275
      (owed.requirement) is the only caller, matching the memoBacklinks comment.
      Saves one strauss-kb backlinks spawn (measured 0.35-0.45s) per open
      blocking/important risk without verified_by on every gate run; sameArea
      scan over risks x files removed. checks.spec + fixture.spec 53/53 on 5 of
      6 runs.
  - by: "agent:correctness"
    at: "2026-09-19T06:23:36.326Z"
    note: >-
      At 8f456848: owed.mjs verification yields warn only, answered() returns
      false for want=[], uncovered.signal counts block-severity signals only;
      write.ts refuses test-obligation via Object.hasOwn(RETIRED_RECORD_TYPES);
      checks.spec 40/40, fixture.spec 14/14, cli+smoke 52/52; validate reports a
      leftover test-obligation as an unrecognised-type error.
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
    hash: "sha256:861951350c190c727e647b6091a95e1db29bcfc0669ac5d64ff91f7781593746"
    hash_kind: raw
    resolved_at: "2026-09-19T06:18:29.826Z"
    lines: 37
    resolver: regex
  - file: packages/strauss-kb/src/commands/types.ts
    symbol: typesCommand
    hash: "sha256:afb30e2e1ecefa8829d4732bfb2a37bf703730e3535cf00071aa0d0300d9dcbb"
    hash_kind: raw
    resolved_at: "2026-09-19T06:18:29.826Z"
    lines: 10
    resolver: regex
  - file: plugins/strauss-kb-review/hooks/scripts/lib/checks/owed.mjs
    symbol: verification
    hash: "sha256:e114147f7b73871720876ca80c1f980e33e53a5bf22cbdff9c7fd5fa7c724c0d"
    hash_kind: ast
    resolved_at: "2026-09-19T06:18:29.832Z"
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
