# Standing-fields control-arm benchmark

Does a machine-readable standing field change what an agent does, or would an
untyped note plus a "be careful, some of this is stale" instruction get to the
same place?

Research code: excluded from the published tarball (`files` in `package.json`
lists `dist`, `README.md`, `ARCHITECTURE.md`, `LICENSE`), not an entry point in
`tsup.config.ts`, never imported from `src/`.

## The four arms

Every arm renders the same bundle, the same records, in the same order, under
the same system prompt. Only the header fields on each record differ.

| Arm | Condition                                                                            |
| --- | ------------------------------------------------------------------------------------ |
| A   | Standing fields, supersession links, and a stub in place of a superseded body        |
| B   | Standing stripped, plus "some of these are stale or were later reversed. Be careful" |
| C   | Standing stripped, no instruction                                                    |
| D   | Standing fields kept, supersession links removed -- trust fields only                |

Arm A is the bundle as `kb_load` presents one; C is the null condition; D
separates "the record says `status: superseded`" from "the record names what
replaced it". B is the one that matters: if it matches A, the fields are
ceremony.

The transforms are pure functions over the parsed bundle in `src/arms.ts`,
asserted byte-for-byte deterministic in `src/arms.spec.ts`.

## The questions

Thirty, in `src/tasks.ts`, cut two ways.

**By what they probe:**

- **current-state** (8) -- a superseded record and its replacement both exist,
  and acting on the superseded one is the failure the fields claim to prevent.
- **rejected-alternative** (8) -- the answer sits in a standing record's
  `## Rejected` section. Standing should not help here; this family is the floor
  that says the arms are otherwise comparable.
- **open-question** (7) -- five that must be refused, two settled controls that
  must not be, so an arm cannot win by refusing everything.
- **aggregation** (7) -- counting or listing across the whole bundle.

**By whether they are comparable across arms:**

- **core** (26) -- ground truth lives in record _content_, which every arm
  receives.
- **standing-only** (4) -- the question asks about a field the transforms
  delete ("how many decisions still hold"), so in arms B and C the answer is
  **absent**.

Only the core set feeds the headline A-B comparison; scoring standing-only
questions inside it would inflate the gap by construction. They are still run
and reported on their own row.

## The rubric is code, not a judge

Each model call is a forced tool call returning `{answer, value, actionable,
concept_ids}`, scored structurally in `src/rubric.ts`: regex over a short
`value`, set equality over `concept_ids`, boolean match on `actionable`. An LLM
judge would be a fifth condition in a four-condition experiment.

## What gets reported

Per-arm accuracy, and **paired A-minus-X differences with bootstrap intervals**
(`src/stats.ts`). The paired interval is the headline: resampling _questions_
cancels the between-question difficulty that dominates a thirty-item set, so it
can exclude zero while the per-arm intervals overlap. Both bootstraps are
seeded, so an interval is reproducible from the result file.

A call the transport could not complete is marked `errored` and leaves the
accuracy denominator and the bootstrap, so a rate limit cannot read as a model
failure. Errored counts are reported.

## The bundle is a fixture, not the real thing

The issue named `blogs/okf-strauss-kb/.kb` (~115 records). No such path -- nor
any other `.kb` or `.strauss/kb` directory -- exists in this repository, so
`bench/bundle/` is a synthesized 51-record bundle about a fictional
multi-tenant scheduling platform: eight supersession chains (one three links
long), sixteen decisions with populated `## Rejected` sections, five open
questions plus one resolved control, and enough constraints, risks, facts, and
obligations for the aggregation questions to have an answer.

### The leak invariants

If a record narrates its own history, the standing signal survives into arms B
and C in prose. Three checks, asserted in `src/bundle.spec.ts` against
`src/chains.ts`:

1. **No body carries a narration phrase.** `NARRATION_PATTERNS`: `supersedes`,
   `no longer`, `instead of`, `keeping`, `at the time`, `previously`, and the
   rest.
2. **No replacement names the thing it replaced.** Each pair carries a
   hand-written `staleTokens` list: the new payload-cap record may not say
   "256", the SES record may not say "SNS", the JetStream record may not say
   "SQS". Naming a _generic_ alternative ("a managed cloud queue") is fine.
3. **The denylist is itself checked.** Every `staleTokens` entry must appear in
   the record it is derived from.

The lists are hand-written because a derivation would flag Twilio's legitimate
return two links after SNS leaves the notification chain.

### The other invariants

**No record id encodes an ordinal.** There is no `decision.queue-backend-v2`;
the replacement is `decision.jetstream-queue-backend`. Dates (`recorded:`)
survive into every arm -- an untyped note does carry when it was written.

`src/bundle.spec.ts` recomputes each aggregation count and id set from the
bundle rather than transcribing it, so a record added to the fixture fails the
suite until the ground truth follows.

## Caching

The bundle goes in its own user content block carrying the `cache_control`
breakpoint; the question and answer instructions follow it, uncached. Caching is
a prefix match over `tools` -> `system` -> `messages`, and a marker only caches
what precedes it: the ~60-token system prompt is under every model's minimum
cacheable prefix (1024 on Sonnet 5, 4096 on Haiku 4.5), so a breakpoint there
would cache nothing and report `cache_creation_input_tokens: 0` without an
error.

Jobs run arm-major within a model so an arm's thirty questions hit a warm
prefix. The default 5-minute TTL suits that; the 1-hour TTL would double the
write premium (2x rather than 1.25x).

`src/models.ts` prices the three input classes separately -- uncached at the
base rate, cache writes at 1.25x, cache reads at 0.1x -- and reports every
estimate both ways. Only the uncached figure is a bound.

## Running it

The dry run needs no credentials and no network. It is part of `pnpm test`:

```bash
cd packages/strauss-kb && pnpm test          # includes the bench dry-run suite
pnpm exec vitest run bench                   # just the bench suite
```

Price a run before spending anything:

```bash
pnpm bench -- --estimate                     # smoke
pnpm bench -- --full --estimate              # the whole matrix
```

Run against the real API (needs `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN`):

```bash
pnpm bench                                   # smoke: arms A+B, 4 core questions, Sonnet 5
pnpm bench -- --full                         # 30 questions x 4 arms x 2 models
```

Other flags: `--arms=A,D`, `--models=claude-haiku-4-5`, `--tasks=12`,
`--concurrency=8`, `--out=<dir>`. Unknown arms, unknown models, and out-of-range
numbers are rejected before any call is made.

Results land in `results/` as a markdown report and the same run as JSON with
every per-cell check. See `results/README.md`.

## What has not been run

The full 30 x 4 x 2 matrix has not been run. It is a spend decision; the
estimate is in `results/README.md`.
