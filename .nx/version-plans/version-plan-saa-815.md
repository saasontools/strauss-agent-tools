---
"@saasontools/strauss-kb": patch
---

New CLI-only command `strauss-kb init [--bundle PATH]`: creates the base
directory and excludes its search index from Git, by writing a marked block
into `<kb>/.gitignore`. Safe to re-run — the block is written only when it is
not already there, byte for byte, and an ignore file you already have keeps its
contents.

Nothing else writes that file. Writing a record still creates the base
directory, but a rule you delete stays deleted; re-running `init` is how you
ask for it back. `kb-pins.local.json` is not excluded for you either — the only
file that could is committed and shared, and the CLI reference says where to
put the rule instead.
