---
"@saasontools/strauss-kb": minor
---

kb_load gains an explicit unbounded mode: `all: true` (CLI `--all`) loads the entire bundle regardless of budget, mutually exclusive with `budgetTokens`; loaded results now carry `tokensLoaded` (renamed from `approxTokens`) and `budgetTokens: null` when no ceiling was applied
