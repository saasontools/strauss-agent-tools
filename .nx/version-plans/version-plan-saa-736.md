---
"@saasontools/strauss-kb": patch
---

Git hygiene for a base that is committed and reviewed on GitHub: `.gitattributes`
marks `INDEX.md`, `log.jsonl` and `.index.sqlite` `linguist-generated`, so a pull
request collapses them and shows the records; the log reader reads past the
conflict markers GitHub's merge button leaves, keeping both sides' entries. New
`sweep` / `kb_sweep` deletes tagged records in a terminal status — the one verb
that removes rather than supersedes.
