# Standing-fields control-arm benchmark

Does a machine-readable standing field change what an agent does, or would an
untyped note plus a "be careful, some of this is stale" instruction get to the
same place?

This directory is the harness that answers it. It is research code: excluded
from the published tarball (`files` in `package.json` lists `dist`, `README.md`,
`ARCHITECTURE.md`, `LICENSE`), not an entry point in `tsup.config.ts`, and never
imported from `src/`.

## The four arms

Every arm renders the **same bundle**, the **same records**, in the **same
order**, under the **same system prompt**. Only the header fields on each record
differ, so a difference in accuracy cannot be an artefact of something one arm
never saw.

| Arm | Condition                                                                            |
| --- | ------------------------------------------------------------------------------------ |
| A   | Standing fields, supersession links, and a stub in place of a superseded body        |
| B   | Standing stripped, plus "some of these are stale or were later reversed. Be careful" |
| C   | Standing stripped, no instruction                                                    |
| D   | Standing fields kept, supersession links removed -- trust fields only                |

Arm A is the bundle as `kb_load` presents one. Arm C is the null condition. Arm
B is the one that matters: it is what a careful engineer would do without the
fields, and if it matches A the fields are ceremony. Arm D separates "the record
says `status: superseded`" from "the record names what replaced it".

The transforms live in `src/arms.ts` and are pure functions over the parsed
bundle -- deterministic, byte-for-byte, asserted as such in `src/arms.spec.ts`.

## The questions

Thirty, in `src/tasks.ts`, cut two ways.

**By what they probe:**

- **current-state** (8) -- a superseded record and its replacement both exist,
  and acting on the superseded one is the failure the fields claim to prevent.
- **rejected-alternative** (8) -- the answer sits in a standing record's
  `## Rejected` section. Standing should not help here; this family is the floor
  that says the arms are otherwise comparable.
- **open-question** (7) -- five that must be refused, and two settled controls
  that must not be, so an arm cannot win by refusing everything.
- **aggregation** (7) -- counting or listing across the whole bundle.

**By whether they are comparable across arms:**

- **core** (26) -- ground truth lives in record _content_, which every arm
  receives. A current-state question is core: both records are in the prompt,
  both state a claim, and the model has to pick. Arms B and C can answer; they
  just have less to go on.
- **standing-only** (4) -- the question asks about a field the transforms
  delete: "list the records flagged blocking", "how many decisions still hold",
  "which AWS services does the current architecture use". In arms B and C the
  answer is not harder, it is **absent**.

Only the core set feeds the headline A-B comparison. Scoring the standing-only
questions inside it would measure the deletion rather than any behaviour and
would inflate the gap by construction -- the harness would be marking its own
homework. They are still run and still reported, on their own row, because "how
much of the gap is deleted ground truth" is worth being able to read.

## The rubric is code, not a judge

Each model call is a forced tool call returning `{answer, value, actionable,
concept_ids}`. `src/rubric.ts` scores that structurally: regex over a `value`
the prompt asked to be short, set equality over `concept_ids`, and a boolean
match on `actionable`.

An LLM judge would be a fifth condition in a four-condition experiment -- its own
prior about staleness would sit between the arms and the number.

## What gets reported

Per-arm accuracy, and **paired A-minus-X differences with bootstrap intervals**
(`src/stats.ts`). The paired interval is the headline: the arms answer the same
questions, so resampling _questions_ rather than cells cancels the
between-question difficulty that dominates a thirty-item set. A paired interval
can exclude zero while the two per-arm intervals visibly overlap.

Both bootstraps are seeded, so an interval is reproducible from the result file.

A call that the transport could not complete -- a 429 that outlived its retries,
a connection that never came back -- is marked `errored` and leaves the accuracy
denominator and the bootstrap entirely. It is not a wrong answer, and scoring it
as one would let a rate limit read as a model failure, dragging whichever arm
happened to be running when the limit hit. Errored counts are reported.

## The bundle is a fixture, not the real thing

The issue named `blogs/okf-strauss-kb/.kb` (~115 records). **That path does not
exist in this repository, and neither does any other `.kb` or `.strauss/kb`
directory.** `bench/bundle/` is therefore a synthesized 51-record bundle about a
fictional multi-tenant scheduling platform, built to exercise the same things:
eight supersession chains (one of them three links long), sixteen decisions with
populated `## Rejected` sections, five open questions plus one resolved control,
and enough constraints, risks, facts, and obligations for the aggregation
questions to have an answer.

### The leak invariants

If a record narrates its own history, arms B and C keep the standing signal in
prose, answer correctly for a reason the benchmark is not measuring, and the A-B
gap closes for the wrong reason. Three checks guard against that, all asserted
in `src/bundle.spec.ts` against the chain data in `src/chains.ts`:

1. **No body carries a narration phrase.** `NARRATION_PATTERNS` is a curated
   list -- `supersedes`, `no longer`, `instead of`, `keeping`, `at the time`,
   `previously`, and the rest. Every record states what holds, full stop.
2. **No replacement names the thing it replaced.** Each pair carries a
   hand-written `staleTokens` list: the new payload-cap record may not say
   "256", the SES record may not say "SNS", the JetStream record may not say
   "SQS". A Rejected section may name a _generic_ alternative ("a managed cloud
   queue"); naming the specific incumbent is the leak.
3. **The denylist is itself checked.** A token that is not in the stale record
   either is a typo dressed as a passing test, so the suite asserts every
   `staleTokens` entry actually appears in the record it is derived from.

The lists are hand-written and not derived, because the judgement is exactly
what a derivation would get wrong: SNS is the incumbent in one link of the
notification chain, while Twilio legitimately returns two links later.

### The other invariant

**No record id encodes an ordinal.** There is no `decision.queue-backend-v2`;
the replacement is `decision.jetstream-queue-backend`. A `-v2` suffix would leak
the ordering into arms that are supposed to have lost it.

Dates (`recorded:`) survive into every arm. An untyped note really does carry
when it was written, and removing that would make the control weaker than the
thing it is standing in for.

The aggregation ground truth is not transcribed by hand -- `src/bundle.spec.ts`
recomputes each count and id set from the bundle and asserts it against the
rubric, so a record added to the fixture fails the suite until the ground truth
follows it.

## Caching

The bundle goes in its own user content block carrying the `cache_control`
breakpoint; the question and the answer instructions follow it, uncached. That
placement matters: caching is a prefix match over `tools` -> `system` ->
`messages`, and a marker only caches what precedes it. The system prompt here is
about sixty tokens, well under every model's minimum cacheable prefix (1024 on
Sonnet 5, 4096 on Haiku 4.5), so a breakpoint there would cache nothing at all
and report `cache_creation_input_tokens: 0` without an error.

Jobs run arm-major within a model so an arm's thirty questions hit a warm
prefix. The default 5-minute TTL is right for that: the start-to-start gap is
seconds, and the 1-hour TTL would double the write premium (2x rather than
1.25x) for nothing.

`src/models.ts` prices the three input classes separately -- uncached at the base
rate, cache writes at 1.25x, cache reads at 0.1x -- and every estimate is
reported twice, cached and uncached. The second is the only one that is a bound.

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
numbers are rejected before any call is made -- a typo should cost nothing.

Results land in `results/` as a markdown report and the same run as JSON with
every per-cell check. See `results/README.md`.

## What has not been run

The full 30 x 4 x 2 matrix has not been run. It is a spend decision, and the
estimate is in `results/README.md`.
