---
"@saasontools/strauss-kb": patch
---

An anchor naming another repository now resolves against that repository's remote through a bare cache under `~/.strauss/repo-cache`, instead of being skipped as `foreign-repo`. A pinned `ref` gets three states (`matches-ref`, `drifted-from-ref`, `drifted-on-default`); `--offline` reads the cache without fetching, and `kb_load`/`kb_query`/`kb_doctor` report what they could not reach as `unchecked`.
