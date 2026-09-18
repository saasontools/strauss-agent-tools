---
"@saasontools/strauss-kb": patch
---

`anchor-resolve` exits 0 on a rebaseline the base took. Each result carries an
`outcome` — `applied` once the record is persisted, `skipped` where a rule
forbids the write, `failed` where it was refused — with an `outcomeReason` of
`frozen`, `write-failed` or `pinned-ref`; `rebaselined` is set only alongside
`applied`. An anchor with no hash reports `unstamped` until a stamp lands, a
frozen base plans no `resolved_at` backfill, and a typed store error
propagates instead of becoming a finding.

`anchor-set --resolve` reports `baseline: "incomplete"` and exits 1 when a
stamp did not land, rather than claiming `stamped`.
