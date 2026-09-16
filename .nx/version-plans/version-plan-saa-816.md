---
"@saasontools/strauss-kb": patch
---

`anchor-resolve` no longer writes `verified[]`: an anchor's `hash` and
`resolved_at` are the mechanical evidence, and `verified[]` holds judgments. Its
result drops `verified` and `verifyRefused`. `--check` (MCP `check`) resolves
and reports without writing anything. `verify` refuses the actor `unknown`, and
every write refuses an actor that is not `kind` or `kind:name`.
