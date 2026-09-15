# Performance review: what to check in this repository

| Area              | Check                                                                                                                                                    | Where to look                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Stop hook path    | Idle path spawns nothing; the digest-and-stamp short circuit stays first; every CLI spawn sits behind the 45 s wall budget and the 10 s per-call timeout | `plugins/strauss-kb-review/hooks/scripts/kb-review-gate.mjs`, `lib/cli.mjs` |
| Spawn count       | One spawn per verb per Stop, memoised per record where a check asks per record (`backlinks`); no spawn inside a loop over hunks                          | `lib/context.mjs`                                                           |
| Anchor resolution | A resolver is prepared only for anchors that can resolve; grammar load once per process; `stamp` ~15 ms on the fixture base                              | `packages/strauss-kb/src/anchor-resolver/`, `commands/stamp.ts`             |
| Diff size         | `-U0` hunks; `maxBuffer` bounded; a pathological diff degrades to a warning, not a hang                                                                  | `lib/git.mjs`                                                               |
| Ceilings in tests | `perf.spec.ts` ceilings (classify 4 s, gate idle 2 s) are smoke checks; a change that moves them needs a number in the PR, not a raised ceiling          | `packages/strauss-kb/src/perf.spec.ts`, `hooks/scripts/hook.spec.mjs`       |
| Bundle and index  | `.index.sqlite` rebuilt only when a record is newer; `load` refuses over the token budget rather than truncating                                         | `packages/strauss-kb/src/kb-store.ts`                                       |
| Reviewer gate     | Pre-flight (`validate`, `doctor --strict`) once per base state, cached in the session state                                                              | `kb-reviewer-gate.mjs` `preflight`                                          |

A performance finding carries a measurement or the missing one: "this adds a spawn per hunk" is a finding; "this looks slow" is not.
