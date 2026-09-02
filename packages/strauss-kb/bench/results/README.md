# Benchmark results

Each run writes two files here, named `<label>-<iso timestamp>`:

- `.md` -- the paired A-minus-X differences, per-arm accuracy split into core
  and standing-only, the per-question-type breakdown, any calls that errored,
  and the bill.
- `.json` -- the same run as data: every cell, the model's structured answer,
  and which individual rubric check failed.

Both are gitignored, so committing one takes `git add -f`.

**No run against the real API has happened yet.** The harness was verified with
its dry-run suite (`pnpm exec vitest run bench`, 66 assertions, mock transport);
the machine that built it had no `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN`.

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
per token, plus a 220-token output allowance. Each arm's ~9,205-token prefix is
written to cache once and read back twenty-nine times; the question and answer
instructions (~155 tokens) are uncached on every call.

| model              | calls | prefix cached | prefix never caches |
| ------------------ | ----- | ------------- | ------------------- |
| `claude-sonnet-5`  | 120   | ~$0.61        | ~$2.51              |
| `claude-haiku-4-5` | 120   | ~$0.30        | ~$1.26              |
| **total**          | 240   | **~$0.91**    | **~$3.77**          |

Two columns because a single "with caching" figure would be a forecast dressed
as a budget: entries expire, a retry can land cold, and a prefix under the
model's minimum silently never caches. **~$3.77 is the number that cannot be
exceeded**; ~$0.91 is what it should cost if the cache behaves.

Cache writes bill at 1.25x the base input rate on the default 5-minute TTL and
reads at 0.1x, which is the ~4x spread between the columns. The prefix clears
both models' minimum cacheable size (1024 tokens on Sonnet 5, 4096 on Haiku
4.5), and `pnpm bench -- --full --estimate` warns if that ever stops being true.

Re-run the estimate before spending: the number moves with the bundle.

## A caution about reading one run

240 calls is 30 questions per cell, 26 of them the core set the headline uses. A
95% bootstrap interval on 26 binary trials is roughly +/- 19 points at 50%
accuracy, so a five-point gap between two arms is not a result.

Read the **paired difference** rather than the two per-arm intervals: it
resamples questions instead of cells, so it can exclude zero where the per-arm
intervals overlap. To sharpen it, repeat the matrix at a different seed or widen
the question set.
