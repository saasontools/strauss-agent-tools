---
"@saasontools/strauss-kb": patch
---

`promote` chooses what a copy carries and what a collision does. `--carry`
(MCP `carry`) takes any of `status`, `verified`, `tags`, `anchors`; unnamed,
`status` settles and `verified` and the review tags are stripped, which is the
previous behaviour. `--on-conflict` (MCP `onConflict`) takes `refuse` (the
default), `skip-human-settled` — a target a `human:` actor settled is left
alone — or `force`, the older `--force`. The result is now
`{ to, promoted, skipped }`.

**Removed:** `promote --list` (MCP `list`), the `promoteCandidates` export and
the `KbPromoteCandidate` type. Which records a review promotes is the review
engine's policy, not the store's.

`status --reason "<text>"` (MCP `reason`) stores why on the log entry, and is
required to resolve a `risk`. Log entries gain an optional `reason`.
