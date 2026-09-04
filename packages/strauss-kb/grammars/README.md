# Grammars

`manifest.json` pins the `tree-sitter-wasms` version and a sha256 and byte
count for every grammar that release ships. The WASM is not published; it
downloads on first use, verified against this file.

`tags/<language>.scm` is that grammar's upstream definitions query, vendored
from the exact release the WASM was built from — the `grammar` field of each
manifest entry, with provenance in `tags/SOURCES.md` — so runtime, grammar and
query are pinned as one triple and the pin run fails if a query will not
compile. A language with no file here parses but resolves nothing.
`extensions.json` maps file extension to language, from GitHub Linguist.

Re-pin all three with `pnpm grammars:pin [version]`, which also refreshes the
`test/fixtures/grammars/` files that already exist. The grammar ABI is tied to
the `web-tree-sitter` minor in `package.json` — stamped as `webTreeSitter` —
so bump both together and run the suite.
