---
"@saasontools/strauss-kb": patch
---

Classify a diff: `classify --git <base>..<head>` / `--stdin` and `kb_classify`
give every changed file one of `test`, `config`, `ci`, `docs`, `lockfile`,
`generated`, `boilerplate`, `rename` or `source`, with the rule that decided
it. The rules are a data table — a generator's banner, then paths, then rename,
then the share of changed lines that is import/export shape — and a `fact`
tagged `review:generated`, `review:boilerplate` or `review:move` anchored on a
file beats them. Nothing is stored: a class the base held would be a second
copy of what the patch already says. `parseUnifiedDiff` gains `keepEmpty` and
`withLines`, and now reads `rename from`/`similarity index` onto every file.
