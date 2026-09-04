# Grammars

A language pack is a WASM grammar and the definitions query that runs over it,
pinned together per language. Three files:

- `packs.json` — where each pack's two parts come from. The only file a human
  edits.
- `manifest.json` — the lock: resolved URL, sha256 and byte count per part,
  plus the license and file extensions. Generated; never hand-edited. The
  runtime reads this and nothing else.
- `tags/<language>.scm` — the vendored query, written from the parts the lock
  names, LF-normalised, headed by the URLs it came from. Absent where a pack
  declares no query: that language parses but resolves nothing.

## Commands

| Command                         | Does                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `pnpm grammars pin <lang>…`     | Resolves, downloads, proves and locks. `--all` for every pack.                    |
| `pnpm grammars add <lang>`      | Writes the packs.json entry, then pins it. `--package --wasm --tags --ext`.       |
| `pnpm grammars upgrade <lang>…` | Re-asks the registry what is newest, then pins. `--all`.                          |
| `pnpm grammars check`           | Re-downloads and re-proves everything the lock names. `--outdated` also compares. |

Pinning proves both parts: the WASM must load under the installed
`web-tree-sitter`, and the query must compile against it. A missing or failing
part fails the run and names the language, the part and the URL it tried.

## packs.json

```json
"python": { "package": "tree-sitter-python" },
"tsx": {
  "package": "tree-sitter-typescript",
  "wasm": "tree-sitter-tsx.wasm",
  "tags": ["npm:tree-sitter-javascript/queries/tags.scm", "queries/tags.scm"]
}
```

`package` names the npm package whose version is pinned; `version` fixes it
exactly, and without one a pin holds the locked version while `upgrade` moves
to the newest release. `wasm` defaults to `<package>.wasm` and `tags` to
`queries/tags.scm`; a list of `tags` concatenates in order, and `null` says
upstream ships none. `extensions` replaces the pack's Linguist list, `claims`
keeps it but wins the named extensions when two packs inherit the same one, and
`linguist` at the top of the file pins the Linguist tag both come from.

A locator is one of:

| Form                             | Resolves to                                        |
| -------------------------------- | -------------------------------------------------- |
| `queries/tags.scm`               | that path in the pack's own package at its pin     |
| `npm:<pkg>[@<ver>]/<path>`       | jsDelivr's npm mirror; no `@ver` means newest      |
| `gh:<owner>/<repo>@<ref>/<path>` | jsDelivr's GitHub mirror; `<ref>` becomes a commit |
| `https://…`                      | itself                                             |

The grammar ABI is tied to the `web-tree-sitter` minor in `package.json` —
stamped as `webTreeSitter` — so bump both together and run the suite.
