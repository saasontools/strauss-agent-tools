---
"@saasontools/strauss-kb": patch
---

`classify` caches each file's generated-banner read per blob — by path, size
and mtime within a process, and across runs under `~/.strauss/cache/classify`
(`STRAUSS_KB_CACHE_DIR`, `off` to disable). `match` and `classify` over the same
range now resolve each file's symbols once between them instead of once each.
Both emit a telemetry event carrying record, file and hunk counts beside
`durationMs`.
