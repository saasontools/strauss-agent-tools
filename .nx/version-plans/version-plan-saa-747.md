---
"@saasontools/strauss-kb": patch
---

Record what each operation did, in a stream kept apart from the base's own
`log.jsonl`: `validate`, `doctor`, `anchor-resolve`, `stamp`, `verify`,
`status`, `supersede`, `write` and `write-decision` now emit one event each.
`STRAUSS_TELEMETRY` picks the sink — `local` (default) appends JSONL under
`~/.strauss/telemetry`, `stdout` writes to stderr, `off` drops — and
`strauss-kb telemetry summary` aggregates the local files.
