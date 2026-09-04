# Grammars

`manifest.json` pins the `tree-sitter-wasms` version the anchor resolver's six
grammars come from, with a sha256 and a byte count for each. The WASM is not
published; it downloads on first use, verified against this file.

Re-pin with `pnpm grammars:pin [version]`, which also refreshes
`test/fixtures/grammars/`. The grammar ABI is tied to the `web-tree-sitter`
minor in `package.json`; bump both together and run the suite.
