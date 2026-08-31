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

Thirty, in `src/tasks.ts`, in four families:

- **current-state** (8) -- a superseded record and its replacement both exist,
  and acting on the superseded one is the failure the fields claim to prevent.
- **rejected-alternative** (8) -- the answer sits in a standing record's
  `## Rejected` section. Standing should not help here; this family is the floor
  that says the arms are otherwise comparable.
- **open-question** (7) -- five that must be refused, and two settled controls
  that must not be, so an arm cannot win by refusing everything.
- **aggregation** (7) -- counting or listing across the whole bundle.

## The rubric is code, not a judge

Each model call is a forced tool call returning `{answer, value, actionable,
concept_ids}`. `src/rubric.ts` scores that structurally: regex over a `value`
the prompt asked to be short, set equality over `concept_ids`, and a boolean
match on `actionable`.

An LLM judge would be a fifth condition in a four-condition experiment -- its own
prior about staleness would sit between the arms and the number. Confidence
intervals are a seeded percentile bootstrap written out in `src/stats.ts`,
because an accuracy over thirty questions is not normal near the ends of its
range, which is exactly where an arm gets interesting.

## The bundle is a fixture, not the real thing

The issue named `blogs/okf-strauss-kb/.kb` (~115 records). **That path does not
exist in this repository, and neither does any other `.kb` or `.strauss/kb`
directory.** `bench/bundle/` is therefore a synthesized 51-record bundle about a
fictional multi-tenant scheduling platform, built to exercise the same things:
eight supersession chains (one of them three links long), sixteen decisions with
populated `## Rejected` sections, five open questions plus one resolved control,
and enough constraints, risks, facts, and obligations for the aggregation
questions to have an answer.

Two invariants make the comparison honest, both asserted in `src/bundle.spec.ts`:

- **No record's body mentions supersession.** Every record states its claim as
  if it were current. If a body said "this replaces the earlier decision", arms
  B and C would still carry the signal in prose and the experiment would measure
  nothing.
- **No record id encodes an ordinal.** There is no `decision.queue-backend-v2`;
  the replacement is `decision.jetstream-queue-backend`. A `-v2` suffix would
  leak the ordering into arms that are supposed to have lost it.

Dates (`recorded:`) survive into every arm. An untyped note really does carry
when it was written, and removing that would make the control weaker than the
thing it is standing in for.

The aggregation ground truth is not transcribed by hand -- `src/bundle.spec.ts`
recomputes each count and id set from the bundle and asserts it against the
rubric, so a record added to the fixture fails the suite until the ground truth
follows it.

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
pnpm bench                                   # smoke: arms A+B, 4 questions, Sonnet 5
pnpm bench -- --full                         # 30 questions x 4 arms x 2 models
```

Other flags: `--arms=A,D`, `--models=claude-haiku-4-5`, `--tasks=12`,
`--concurrency=8`, `--out=<dir>`.

Results land in `results/` as a markdown report and the same run as JSON with
every per-cell check. See `results/README.md`.

## What has not been run

The full 30 x 4 x 2 matrix has not been run. It is a spend decision, and the
estimate is in `results/README.md`.
