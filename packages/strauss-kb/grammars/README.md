# Grammars

Prebuilt tree-sitter grammars for the anchor resolver, vendored from
[`tree-sitter-wasms`](https://www.npmjs.com/package/tree-sitter-wasms) 0.1.13
so a cold install needs no build toolchain and no 51 MB grammar bundle.

Refresh with `node scripts/sync-grammars.mjs`. The grammar ABI is tied to the
`web-tree-sitter` minor pinned in `package.json`; bump both together and run
the suite.
