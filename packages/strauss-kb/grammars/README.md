# Grammars

`manifest.json` pins the `tree-sitter-wasms` version the anchor resolver's six
grammars come from, with a sha256 and a byte count for each. The WASM itself is
not published: 6.6 MB in every install, for a feature most installs never reach,
is a bad trade. A grammar is downloaded from jsDelivr on first use, verified
against the manifest, and cached under `~/.strauss/grammars/<version>/`.

Re-pin with `pnpm grammars:pin [version]`, which also refreshes
`test/fixtures/grammars/`. The grammar ABI is tied to the `web-tree-sitter`
minor in `package.json`; bump both together and run the suite.
