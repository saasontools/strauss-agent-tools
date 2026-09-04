# Tags query sources

Vendored by `pnpm grammars:pin --tags`; only line endings are
normalised. Each query comes from the exact grammar release its WASM was
built from, so the two cannot drift. Rule says how that release was
identified: `lockfile`, from the one committed at the `tree-sitter-wasms`
release, or `published-before`, the newest release satisfying the declared
range that npm published before it. A file with two rows is a
concatenation: upstream ships TypeScript's tags as a delta over
JavaScript's.

| File             | Package                | Release                                    | Rule     | Source | Path               | License    |
| ---------------- | ---------------------- | ------------------------------------------ | -------- | ------ | ------------------ | ---------- |
| `c.scm`          | tree-sitter-c          | `0.20.8`                                   | lockfile | npm    | `queries/tags.scm` | MIT        |
| `c_sharp.scm`    | tree-sitter-c-sharp    | `0.20.0`                                   | lockfile | npm    | `queries/tags.scm` | MIT        |
| `cpp.scm`        | tree-sitter-cpp        | `0.20.5`                                   | lockfile | npm    | `queries/tags.scm` | MIT        |
| `dart.scm`       | tree-sitter-dart       | `d4d8f3e337d8be23be27ffc35a0aef972343cd54` | lockfile | github | `queries/tags.scm` | MIT        |
| `elisp.scm`      | tree-sitter-elisp      | `1.5.0`                                    | lockfile | npm    | `queries/tags.scm` | MIT        |
| `elixir.scm`     | tree-sitter-elixir     | `0.1.1`                                    | lockfile | npm    | `queries/tags.scm` | Apache-2.0 |
| `go.scm`         | tree-sitter-go         | `0.20.0`                                   | lockfile | npm    | `queries/tags.scm` | MIT        |
| `java.scm`       | tree-sitter-java       | `0.20.2`                                   | lockfile | npm    | `queries/tags.scm` | MIT        |
| `javascript.scm` | tree-sitter-javascript | `0.20.4`                                   | lockfile | npm    | `queries/tags.scm` | MIT        |
| `ocaml.scm`      | tree-sitter-ocaml      | `0.20.4`                                   | lockfile | npm    | `queries/tags.scm` | MIT        |
| `php.scm`        | tree-sitter-php        | `0.22.8`                                   | lockfile | npm    | `queries/tags.scm` | MIT        |
| `python.scm`     | tree-sitter-python     | `0.21.0`                                   | lockfile | npm    | `queries/tags.scm` | MIT        |
| `ruby.scm`       | tree-sitter-ruby       | `0.20.1`                                   | lockfile | npm    | `queries/tags.scm` | MIT        |
| `rust.scm`       | tree-sitter-rust       | `0.20.4`                                   | lockfile | npm    | `queries/tags.scm` | MIT        |
| `solidity.scm`   | tree-sitter-solidity   | `b239a95f94cfcc6e7b3e961bc73a28d55e214f02` | lockfile | github | `queries/tags.scm` | MIT        |
| `swift.scm`      | tree-sitter-swift      | `0.4.3`                                    | lockfile | npm    | `queries/tags.scm` | MIT        |
| `tsx.scm`        | tree-sitter-javascript | `0.20.4`                                   | lockfile | npm    | `queries/tags.scm` | MIT        |
| `tsx.scm`        | tree-sitter-typescript | `0.20.5`                                   | lockfile | npm    | `queries/tags.scm` | MIT        |
| `typescript.scm` | tree-sitter-javascript | `0.20.4`                                   | lockfile | npm    | `queries/tags.scm` | MIT        |
| `typescript.scm` | tree-sitter-typescript | `0.20.5`                                   | lockfile | npm    | `queries/tags.scm` | MIT        |
