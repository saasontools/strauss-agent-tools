# Benchmark results

Each run writes two files here, named `<label>-<iso timestamp>`:

- `.md` -- paired differences, per-arm accuracy, the per-type breakdown,
  errored calls, the bill.
- `.json` -- the same run as data: every cell, its structured answer, and which
  rubric check failed.

Both are gitignored, so committing one takes `git add -f`.

**No run against the real API has happened yet** -- only the mock-transport
dry-run suite (`pnpm exec vitest run bench`).

## Running the full matrix

```bash
cd packages/strauss-kb
export ANTHROPIC_API_KEY=...          # or ANTHROPIC_AUTH_TOKEN
pnpm bench -- --full --estimate       # price it first
pnpm bench -- --full

pnpm bench -- --full --transport=claude --estimate   # no key: the local CLI
pnpm bench -- --full --transport=claude
```

The `claude` transport spends the login's quota, not dollars, and files its
results as `full-claude-<timestamp>`.

30 questions x 4 arms x 2 models = **240 calls**.

## What the full matrix costs

| model              | calls | prefix cached | prefix never caches |
| ------------------ | ----- | ------------- | ------------------- |
| `claude-sonnet-5`  | 120   | ~$0.61        | ~$2.51              |
| `claude-haiku-4-5` | 120   | ~$0.30        | ~$1.26              |
| **total**          | 240   | **~$0.91**    | **~$3.77**          |

The right column is the number that cannot be exceeded. Re-run the estimate
before spending: it prints current token counts and warns if the prefix stops
clearing a model's minimum cacheable size.

## A caution about reading one run

A 95% bootstrap interval on the 26 core questions is roughly +/- 19 points at
50% accuracy, so a five-point gap between two arms is not a result. Read the
paired difference instead; to sharpen it, repeat at a different seed or widen
the question set.
