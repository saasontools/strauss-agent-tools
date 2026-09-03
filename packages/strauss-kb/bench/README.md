# Standing-fields control-arm benchmark

Does a machine-readable standing field change what an agent does, or would an
untyped note plus a "some of this is stale" warning get to the same place?

Research code: never imported from `src/`, no `tsup.config.ts` entry, outside
the `files` list that builds the published tarball.

## The four arms

Every arm renders the same records in the same order under the same system
prompt. Only the header fields differ.

| Arm | Condition                                                                 |
| --- | ------------------------------------------------------------------------- |
| A   | Standing fields, supersession links, superseded bodies stubbed            |
| B   | Standing stripped, plus "some of these are stale or reversed. Be careful" |
| C   | Standing stripped, no instruction                                         |
| D   | Standing fields kept, supersession links removed                          |

The transforms are pure functions in `src/arms.ts`, asserted deterministic in
`src/arms.spec.ts`.

## The questions

Thirty, in `src/tasks.ts`, cut two ways. **By what they probe:**

- **current-state** (8) -- acting on the superseded record is the failure
  standing claims to prevent.
- **rejected-alternative** (8) -- answered from a standing record's
  `## Rejected`. Standing should not help here: this family is the floor
  showing the arms are otherwise comparable.
- **open-question** (7) -- five must be refused, two settled controls must not
  be, so refusing everything cannot win.
- **aggregation** (7) -- counting or listing across the bundle.

**By comparability across arms** (`TaskFamily` in `src/model.ts`): **core**
(26) feed the headline A-B comparison, **standing-only** (4) get their own row.

## The rubric is code, not a judge

Each call is forced to return `{answer, value, actionable, concept_ids}`,
scored structurally in `src/rubric.ts`. An LLM judge would be a fifth condition
in a four-condition experiment.

## What gets reported

Per-arm accuracy, and **paired A-minus-X differences with bootstrap intervals**
(`src/stats.ts`). The paired interval is the headline: resampling _questions_
cancels the between-question difficulty that dominates a thirty-item set, so it
can exclude zero while per-arm intervals overlap. Both bootstraps are seeded.
Calls the transport could not complete get their own count.

## The bundle is a fixture

The issue named `blogs/okf-strauss-kb/.kb`, absent here, as is any other `.kb`
or `.strauss/kb` directory. So `bench/bundle/` is a synthesized
51-record bundle about a fictional multi-tenant scheduling platform: eight
supersession chains (one three links long), 24 decision records carrying
`## Rejected` of which 16 are standing, five open questions plus one resolved
control, and enough other records to give the aggregation questions an answer.

### The invariants

A record narrating its own history leaks standing into arms B and C in prose,
so `src/bundle.spec.ts` asserts three checks against `src/chains.ts`: no
narration phrase in any body, no replacement naming what it replaced, and every
`staleTokens` entry really present in the record it came from. Nor does an id
encode an ordinal -- `decision.queue-backend` is replaced by
`decision.jetstream-queue-backend`, not `-v2`.

The same suite recomputes each aggregation count and id set from the bundle
rather than transcribing it, so a new record fails until the ground truth
follows.

## Caching

The bundle gets its own user content block carrying the `cache_control`
breakpoint; question and answer instructions follow, uncached. The
~60-token system prompt is under every model's `minCacheableTokens`
(`src/models.ts`), so a breakpoint there would silently cache nothing. Jobs run
arm-major, so an arm's thirty questions hit a warm prefix.

`src/models.ts` prices the three input classes separately; only the uncached
figure is a bound.

## Running it

The dry run needs no credentials and no network; `pnpm test` includes it:

```bash
cd packages/strauss-kb
pnpm exec vitest run bench       # the bench suite alone
pnpm bench -- --help             # every flag
pnpm bench -- --full --estimate  # price it before spending
pnpm bench                       # smoke: arms A+B, 4 questions, Sonnet 5
pnpm bench -- --full             # 30 questions x 4 arms x 2 models
```

A real run needs `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN`. Unknown arms,
models, and out-of-range numbers are rejected before any call. Results land in
`results/`, described in `results/README.md`.

### Running on a Claude Code subscription

`--transport=claude` sends each cell through the local `claude` CLI on its own
login, no API key, spending quota rather than dollars; the reported bill is list
price for the same tokens. Claude Code adds ~900 tokens of scaffolding per call,
so it is a second condition, not a cheaper API. `MAX_THINKING_TOKENS=0` turns
thinking off -- `--effort low` alone does not -- and the run records the total.
