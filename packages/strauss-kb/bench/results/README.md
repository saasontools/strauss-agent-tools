# Benchmark results

Each run writes two files here, named `<label>-<iso timestamp>`:

- `.md` -- paired differences, per-arm accuracy, the per-type breakdown,
  errored calls, the bill.
- `.json` -- the same run as data: every cell, its structured answer, and which
  rubric check failed.

Both are gitignored, so committing one takes `git add -f`.

**Runs so far:**

- `full-claude-2026-09-03T21-51-51-137Z` — 2026-09-03, Claude Code transport, 30 questions, 240 calls, ~$1.57 list; standing beats nothing on the stronger model, but the interval touches zero. Reading in `full-claude-2026-09-03-analysis.md`.
- `full-claude-x3-2026-09-05T11-50-48-935Z` — 2026-09-05, Claude Code transport, 31 questions x 3 repeats, 744 calls, $3.63 list; A − C now excludes zero on both models. Reading in `full-claude-x3-2026-09-05-analysis.md`.

No run over the API transport yet.

## Running the full matrix

```bash
cd packages/strauss-kb
export ANTHROPIC_API_KEY=...          # or ANTHROPIC_AUTH_TOKEN
pnpm bench -- --full --estimate       # price it first
pnpm bench -- --full

pnpm bench -- --full --transport=claude --estimate   # no key: the local CLI
pnpm bench -- --full --transport=claude

# Three repeats per cell, so a flipping question shows up as one:
MAX_THINKING_TOKENS=0 pnpm bench -- --full --transport=claude --repeats=3
```

`--repeats=N` files as `full-claude-xN-<timestamp>`, and the estimate line
scales with N: 744 calls at concurrency 2 is roughly 50 minutes.

The `claude` transport spends the login's quota, not dollars, and files its
results as `full-claude-<timestamp>`.

31 questions x 4 arms x 2 models = **248 calls**, times `--repeats`.

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
paired difference instead; to sharpen it, run `--repeats=3` and check the
stability column before believing any single cell, or widen the question set.
