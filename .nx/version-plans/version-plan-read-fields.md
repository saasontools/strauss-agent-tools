---
"@saasontools/strauss-kb": patch
---

`list`, `load` and `query` — and `kb_list`, `kb_load`, `kb_query` — return
`verify` (`strauss_verify`), `sources` and `owner` (`strauss_owner`) with every
record, so a consumer no longer parses them out of the rendered body.
