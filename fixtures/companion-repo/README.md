# companion-repo fixture

One synthetic repository, one branch per review-companion scenario. Every
consumer — classifier (SAA-728), gate (SAA-729), reviewer (SAA-730),
walkthrough (SAA-731), merge policy (SAA-741) — tests against these branches,
so a behaviour change in one shows up in all.

Nothing here is a package and there is no build. The TypeScript exists to be
diffed and anchored to; the one spec a record asks a reviewer to run does so
under `node --test --experimental-strip-types`.

## Materialize

```sh
pnpm fixtures:companion                        # temp dir, prints JSON
pnpm fixtures:companion --out /tmp/repo        # a directory you name
pnpm fixtures:companion --scenarios docs-only  # one branch, unchanged hashes
pnpm test:fixtures                             # node --test over the same builder
pnpm nx run companion-repo-fixture:test        # the same run, as CI does it
```

`--out` is emptied before the build, so it is refused unless it is absent,
empty, or a previous fixture build. `--force` erases anything else.

From vitest or `node --test`:

```js
import { materialize, readExpected, scenarioNames } from "./materialize.mjs";
const { repo, branches } = materialize({ scenarios: ["blocking-risk"] });
```

`main` is `base/`; each scenario is a branch off it. Author, committer and
dates are fixed, so a given tree always produces the same commit hashes.

## Layout

| Path                             | What it is                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| `base/`                          | The main-branch tree, including a committed `.strauss/kb`                               |
| `scenarios/<name>/head/`         | Files overlaid on base; `<path>.deleted` marks a deletion                               |
| `scenarios/<name>/commits.json`  | Ordered `{ message, files }`, replayed as real commits                                  |
| `scenarios/<name>/expected.json` | `{ route, classifier, gateFamilies, fixable?, doctorArgs, notes }` — the golden answers |
| `recorded/`                      | Recorded agent output, per [recorded/README.md](recorded/README.md)                     |

A `files` entry is a path under `head/`, or `{ "from", "to" }` when one repo
path needs two states across commits and each needs its own name in `head/`
(`author-resolved-risk` parks its commit-1 record under `.open.md`).

## Golden answers

| Branch                   | Route   | Gate families | The trap                                             |
| ------------------------ | ------- | ------------- | ---------------------------------------------------- |
| `docs-only`              | `auto`  | —             | Base silence is correct, not a hole                  |
| `generated-block`        | `auto`  | —             | A `review:generated` fact beats the path heuristic   |
| `silent-code-change`     | `human` | A             | Changed symbol, nothing written, no `decision.none`  |
| `blocking-risk`          | `human` | —             | Well-formed base; `blocking` still never routes auto |
| `author-resolved-risk`   | `human` | D             | `resolved` by the author, no non-author verify       |
| `deleted-record`         | `human` | A             | The risk is in `log.jsonl` and gone from the tree    |
| `policy-file-change`     | `human` | —             | Everything else says auto; the policy row wins       |
| `excluded-path-crosses`  | `human` | A             | The excluded hunk imports an included symbol         |
| `drift-after-commit`     | `human` | B, D          | One anchor wants `--rebaseline`, one must not get it |
| `review-thread-decision` | `human` | —             | `kb_verify` is audit, not approval                   |
| `fabricated-decision`    | `human` | C             | Anchored, typed, validates, and says nothing         |

Families are SAA-729's A–F; each `expected.json` names the individual checks.
`fixable` names the findings a late fixer (`agents/kb-fixer.md`) may apply;
absent means none.

`classifier` maps the three-dot diff `git diff --name-only main...<branch>`,
so a path added and deleted across the branch is absent from it;
`materialize.spec.mjs` asserts every key appears in that diff.

Classifier classes are SAA-728's closed set: `test`, `config`, `ci`, `docs`,
`lockfile`, `generated`, `boilerplate`, `rename`, `source`. The companion
base's own files fall out of the path table like any other — a record is
`docs`, `log.jsonl` is `config` — and carry no class of their own.

## Health of each base

`kb_validate` reports no errors on `main` or on any branch, and
`materialize.spec.mjs` asserts it. Checked out on a branch of the materialized
repo, this reproduces the table:

```sh
node ../../packages/strauss-kb/dist/cli-main.js \
  --bundle "$repo/.strauss/kb" doctor --strict --repo-root "$repo" \
  --unverified-days 3650 --aging-days 3650
```

| Branch                                                                                                     | Findings                                                                                               |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `main`, `docs-only`, `silent-code-change`, `policy-file-change`, `excluded-path-crosses`, `deleted-record` | none                                                                                                   |
| `author-resolved-risk`, `blocking-risk`, `fabricated-decision`, `generated-block`                          | `orphaned` ×1 — the new record has no inbound link                                                     |
| `drift-after-commit`                                                                                       | `orphaned` ×1, `drifted` ×1                                                                            |
| `review-thread-decision`                                                                                   | `orphaned` ×1, `superseded-but-cited` ×1 — the base constraint still `informs` the superseded decision |

`drifted` needs a cached tree-sitter grammar; on a cold runner with no network
the anchors resolve `resolver-unavailable` instead. Record timestamps are
frozen at 2026-09-01, so `unverified` and `aging` would start firing 90 days
later; each `expected.json` pins both thresholds past that in `doctorArgs`,
which is what the command above and the spec pass.

## Adding a scenario

1. `mkdir scenarios/<name>/head` and put the changed files there, mirroring
   their repo paths. A deletion is a `<path>.deleted` file saying so.
2. Records go in `head/.strauss/kb/`. Write them with the real tool against a
   copy of `base/.strauss/kb`, never by hand — frontmatter and `log.jsonl`
   have to be byte-for-byte what the package reads:

   ```sh
   cp -R base/.strauss/kb /tmp/kb
   STRAUSS_KB_ACTOR=agent:impl node ../../packages/strauss-kb/dist/cli-main.js \
     --bundle /tmp/kb write risk < risk.json
   ```

   Copy the files that changed against `base/` into `head/.strauss/kb/`, then
   freeze any new timestamp to keep the tree byte-stable.

3. Write `commits.json` — every file under `head/` must appear in some commit
   or `materialize` throws.
4. Write `expected.json`, copying `doctorArgs` from a sibling, and add the row
   to the table above.
5. `pnpm test:fixtures`.
