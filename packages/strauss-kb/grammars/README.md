# Grammars

A language pack is a WASM grammar and the definitions query that runs over it,
pinned together per language. Two files:

- `packs.json` — where each pack's two parts come from. The only file a human
  edits.
- `manifest.json` — the lock: resolved URL and sha256 per part, plus the
  license and file extensions. Generated; never hand-edited. The runtime reads
  this and nothing else.

Neither part ships. Both download on first use, are checked against the hash
the lock pins on every load, and are cached side by side under
`~/.strauss/grammars/<language>/<sha12>.wasm|.scm`. A pack with no tags part
parses but resolves nothing.

## Commands

| Command                         | Does                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `pnpm grammars pin <lang>…`     | Resolves, downloads, proves and locks. `--all` for every pack.                    |
| `pnpm grammars add <lang>`      | Writes the packs.json entry, then pins it. `--package --wasm --tags --ext`.       |
| `pnpm grammars upgrade <lang>…` | Re-asks the registry what is newest, then pins. `--all`.                          |
| `pnpm grammars check`           | Re-downloads and re-proves everything the lock names. `--outdated` also compares. |

Pinning downloads every part into memory and proves it: the WASM must load
under the installed `web-tree-sitter`, and the query must compile against it. A
missing or failing part fails the run and names the language, the part and the
URL it tried. Nothing but the lock is written — and the tags parts of the six
languages the suite parses, under `test/fixtures/grammars/tags/`, so its server
can serve them offline.

Every pack is proved in one process, in manifest order, with the others
resident — that is how the runtime meets them, and two faults show up no other
way. A grammar must be built at an ABI the pinned `web-tree-sitter` accepts
(0.27 takes 13 through 15, its `MIN_COMPATIBLE_VERSION` through
`LANGUAGE_VERSION`); one outside the range is rejected at `Language.load`, and
the pin stops naming the pack rather than locking a language the resolver would
report unavailable at read time. And a grammar built by a toolchain that
corrupts the shared WASM heap takes down the loads after it, whatever they are.
So a pack's WASM comes from its own release: an aggregate of other projects'
grammars is not a source.

## packs.json

```json
"python": { "package": "tree-sitter-python" },
"tsx": {
  "package": "tree-sitter-typescript",
  "wasm": "tree-sitter-tsx.wasm",
  "tags": ["npm:tree-sitter-javascript/queries/tags.scm", "queries/tags.scm"]
}
```

`package` names the npm package whose version is pinned, or `gh:<owner>/<repo>`
for a grammar that is released rather than published — its version is a release
tag, its bare `wasm` path a release asset and its bare `tags` path a file in the
repository at that tag. `version` fixes the version exactly, and without one a
pin holds the locked version while `upgrade` moves to the newest release.

`wasm` defaults to `<package>.wasm` and `tags` to `queries/tags.scm`; a list of
`tags` concatenates in order, and `null` says
upstream ships none. `extensions` replaces the pack's Linguist list, `claims`
keeps it but wins the named extensions when two packs inherit the same one, and
`linguist` at the top of the file pins the Linguist tag both come from.

A locator is one of:

| Form                                      | Resolves to                                        |
| ----------------------------------------- | -------------------------------------------------- |
| `queries/tags.scm`                        | that path in the pack's own package at its pin     |
| `npm:<pkg>[@<ver>]/<path>`                | jsDelivr's npm mirror; no `@ver` means newest      |
| `gh:<owner>/<repo>@<ref>/<path>`          | jsDelivr's GitHub mirror; `<ref>` becomes a commit |
| `gh-release:<owner>/<repo>@<tag>/<asset>` | that release asset, served by GitHub               |
| `https://…`                               | itself                                             |

The ABI range is tied to the `web-tree-sitter` minor in `package.json` —
stamped as `webTreeSitter` — so bump it, re-pin every pack, and run the suite.
