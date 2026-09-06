---
"@saasontools/strauss-kb": patch
---

Select records by frontmatter `tags`: `kb_list`, `kb_query` and `kb_catalog`
take a `tags` array (CLI `--tag`, repeatable) and return the records carrying
every tag in it, and a `kb_context` profile takes `excludeTags` to keep tagged
records out of the injected block without unpinning the base. Selection runs
after adjudication, so standing and supersession are unchanged, and the
vocabulary is not enforced.
