# Benchmark results

Each run writes two files here, named `<label>-<iso timestamp>`:

- `.md` -- accuracy per (model, arm) with a 95% bootstrap interval, the
  per-question-type breakdown, any calls that errored, and the bill.
- `.json` -- the same run as data: every cell, the model's structured answer,
  and which individual rubric check failed.

The directory is empty apart from this file. **No run against the real API has
happened yet** -- the harness was built and verified with its dry-run suite
(`pnpm exec vitest run bench`, 48 assertions, mock transport), and the machine
that built it had no `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN`, so not even
the smoke run could execute.

## Running the full matrix

```bash
cd packages/strauss-kb
export ANTHROPIC_API_KEY=...          # or ANTHROPIC_AUTH_TOKEN
pnpm bench -- --full --estimate       # price it first
pnpm bench -- --full
```

That is 30 questions x 4 arms x 2 models = **240 calls**.

## What the full matrix costs

Measured by assembling the widest arm's prompt and dividing by four characters
per token, plus a 220-token output allowance:

| model              | calls | ~input tokens/call | est. cost |
| ------------------ | ----- | ------------------ | --------- |
| `claude-sonnet-5`  | 120   | 9,143              | ~$2.46    |
| `claude-haiku-4-5` | 120   | 9,143              | ~$1.23    |
| **total**          | 240   |                    | **~$3.7** |

Prompt caching is enabled on the system block only, so the figure is an upper
bound rather than a target; the bundle itself sits in the user turn, where the
per-arm prefix is identical across that arm's thirty questions and a real run
should read a good deal of it from cache.

Re-run `pnpm bench -- --full --estimate` before spending: the number moves with
the bundle.

## A caution about reading one run

240 calls is 30 questions per cell. A 95% bootstrap interval on 30 binary trials
is roughly +/- 17 points at 50% accuracy, so a five-point gap between two arms is
not a result. The interval is reported for exactly this reason. Repeating the
matrix at a different temperature or seed, or widening the question set, is the
way to sharpen it -- not reading the point estimates harder.
