---
"@saasontools/strauss-kb": patch
---

In a diff a lockfile bump and a change worth reading look the same, so a
reviewer has to open both. `classify --git <base>..<head>` / `--stdin` and
`kb_classify` label every changed file with one of `test`, `config`, `ci`,
`docs`, `lockfile`, `generated`, `boilerplate`, `rename` or `source`, and name
the rule that decided it. The rules are a fixed table — a generator's banner,
then paths, then rename, then the share of changed lines that is import/export
shape — and a `fact` tagged `review:generated`, `review:boilerplate` or
`review:move`, anchored on a file, overrides all of them. No class is stored:
the patch already says it. `parseUnifiedDiff` gains `keepEmpty` and `withLines`
and now reads `rename from` / `similarity index` onto every file.
