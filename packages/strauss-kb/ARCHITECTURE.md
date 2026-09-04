# Architecture

The README is the entry point. This is why the format is shaped as it is.

## One record per file

The filename is the identity, so two writers never merge — they choose distinct
names. Publication uses `link`, so a collision surfaces as a 409 rather than a
silent last-write-wins.

Read-modify-write (`setStatus`, `answer`) checks a content digest immediately
before publishing, narrowing the lost-update window to two adjacent syscalls
rather than closing it. A lock would close it and add a worse failure: a crashed holder blocks every later writer, where a lost update costs one retry.

## Read for a question, not for a session

A base loaded at the start of a long conversation is summarised away by the end,
so no consumer loads it that way:

| Consumer                        | How it reads                                        |
| ------------------------------- | --------------------------------------------------- |
| Diff annotation                 | `matchToDiff` — deterministic, no context           |
| "Has this been decided?"        | a fresh short-lived reader, given base and question |
| An implementor writing a record | a point query at the moment of writing              |

Reloading costs about three thousand tokens for twenty records.

## Load beats retrieval while the base fits

On nine questions whose wording appears in no record, a reader holding the whole
base answered eight; embedding search over the same records answered four. Two
differences are structural: a reader can say no record answers, where vector
search returns its nearest neighbour whatever the distance; and it picks the
record that answers rather than the one nearest the topic.

## What happens when a base outgrows a context

Loading stops working above a few hundred records; what replaces it is the same
reader given candidates, not everything:

```
vector recall  →  top ~20 candidates, with their scores
                  ↓
reader judges  →  picks what answers, or says nothing does
```

The reader stays the judge, preserving the two structural wins above.

**A score threshold is not the growth path.** The wrong `audit trail` hit scored
0.318 against the correct `race condition` hit at 0.295; any cut that drops the
first drops the second. A threshold excludes the absurd — an unrelated query
scored 0.091 — and nothing else.

**Tags are not the growth path either.** The field exists, is written, and read by
nothing but an index line. Free-text tags drift the way `auth` /
`authentication` / `authn` drift; enforcing a vocabulary would make them a
closed enum, which `type` already is. `strauss_anchors` names a file and symbol,
which either match the repository or not.

## Typed links

Supersession is not a rel. It is a lifecycle, and
`strauss_supersedes`/`strauss_superseded_by` already carry it in both
directions; a rel would be a second spelling free to disagree with them.

The rel vocabulary is closed, but the read schema tolerates an unknown one.
Frontmatter strict enough to reject it would make the file fail to parse, and a
file that fails to parse is skipped by `list()` rather than reported — the
bundle would drop the record instead of naming it. Tolerant read, strict write:
`kb_write` refuses an unknown rel, `kb_validate` reports one as an error.

`kb_impact` reports a superseded or rejected record and stops there. A withdrawn
record's declared dependencies are not obligations anyone still owes.

## Rejected: a format that needs a parser

A hand-rolled frontmatter reader could not express nested maps, misreading every
OKF `generated`, `sources[]`, and `verified[]`; its replacement's first log
format was `·`-delimited. Both are gone: the log is JSONL, the schema is emitted
from Zod, and `strauss-kb schema` is the contract.

## Anchor resolution

A fresh stamp is a baseline nobody has checked, so only a run where every
checkable anchor already matched appends `verified[]`.

Symbols resolve through tree-sitter first: a WASM parser per language,
`tags.scm`-style queries over definition sites, and the definition node's range
as the span. A dotted symbol matches the definition whose enclosing chain
matches; a bare name matching two is `symbol-ambiguous`. Only declarations are
captured: a symbol appearing solely in a call is `symbol-not-found`.

The chain is tree-sitter, then regex, then a whole-file hash, and a resolver
that parsed the file answers for it: falling through to a text search would
trade "no such definition" for the first line mentioning the name, and a wrong
span that happens to be stable hashes as `match`. Regex still covers extensions
with no grammar; a grammar that will not load is `resolver-unavailable`, never
a throw.

Each anchor records the resolver that stamped it. A hash only the previous
resolver reproduces is `drifted`, reason `resolver-changed`. Trees are cached
per content hash, grammars load once per process.

A tree-sitter stamp hashes the span's token stream rather than its text
(`hash_kind: "ast"`), so a reformat is not drift; a raw hash keeps comparing
raw until it is rebaselined.

### Drift classification

Once the bytes differ, the question is what a machine can settle and what it
must hand on.

| Class      | Test                                        | Who settles it |
| ---------- | ------------------------------------------- | -------------- |
| `moved`    | the stored hash resolves at another address | `kb_reassess`  |
| `cosmetic` | both spans are one token stream             | classification |
| `gone`     | the file or symbol no longer exists         | a reader       |
| `changed`  | everything else                             | a reader       |

`moved` and `cosmetic` cost a repository search and a git read, so `load` and
`query` report only the two a hash comparison already answers and
`classifyDrift` refines the rest on demand.

Classification stops there because the next question — does the record's claim
still hold — is a reading, and every mechanical proxy for it (similarity
scores, "small" diffs) answers a different question confidently. So the packet
carries the evidence a reader needs and names a type-based default, and no
drift path writes `verified[]` or moves standing.

Repository identity is normalised and compared, not parsed: an invented format
would reject correct values from unseen hosts.

## Remote over local checkout

An anchor naming another repository resolves against that repository's remote,
through a bare cache under `~/.strauss/repo-cache`. A checkout is one person's
view — stale, dirty, or absent — so a hash from it is evidence about that
machine, not the code.

The rejected design was multi-root: `--repo-root name=path` per repository,
root discovery, a `.strauss/kb-roots.json` map, a `repo-not-mapped` finding. It
makes the answer depend on the reader's disk — one machine verifies, another
reports drift — and needs configuring before a base can check itself. Git
already knows how to reach a remote.

A pinned `ref` is checked at that commit and the default branch compared on top
of it: was the record ever true, and does it still hold.

`repo` and `ref` come out of a `.md` file the reader did not write, so both are
validated against a shape before any `git` runs: an argv array stops the shell
but not git's own option parsing, where `--upload-pack=<cmd>` as a rev and
`ext::sh -c <cmd>` as a URL are each an execution primitive.

## Cross-worktree log safety

`log.jsonl` is append-only and the one artifact nothing can rebuild, so how it
merges across worktrees matters more than how any record file does. Records
already don't need this: one concept id is one file, so two writers choosing
distinct ids never merge at all, and `link`-based publish (above) turns the
one case where they collide into a 409 rather than a merge. The log has no
such escape — every writer appends into the same file by design — so it needs
an actual merge strategy, not just atomicity per write.

The append itself already had it: `record()` uses `appendFile`, which opens
`O_APPEND` and is one `write(2)` for an entry this small, so two processes
appending locally interleave whole lines, never a torn one. What was missing
was git's merge of two worktrees' independently-appended logs — the default
line-level merge can conflict, or silently keep one side, on lines that were
never in conflict, since both sides only ever added, never edited, a line.

The fix is `.gitattributes: log.jsonl text eol=lf merge=union`, written by
`record()` — every path that appends a log line (`write`, `setStatus`,
`verify`, `supersede`), not `write()` alone — on first use
(`kb-store.ts#ensureGitattributes`). `union` is a merge driver git ships —
nothing to configure beyond the attribute — that keeps both sides' added
lines; `eol=lf` closes a second divergence path, below. The alternative
considered and dropped was a lock file coordinating writes across worktrees
the way `mutate`'s CAS coordinates a single record: it would need to span
process boundaries and survive a crashed holder, which is the same
stale-lock failure mode rejected above, for a smaller problem than the one it
solves there.

Decisions worth naming because a later reader could reopen them:

- **A `.gitattributes` that exists but declares no merge strategy for the
  log gets the line appended, not left alone.** The alternative — leave a
  user's own file untouched — reads as more conservative, but a bundle that
  already has a `.gitattributes` in front of it is exactly the bundle most
  likely to be shared across worktrees or forks, so leaving it without union
  merge is the worse of the two failure modes. A file that _does_ already
  declare a merge strategy for `log.jsonl` — this one or a user's own, such
  as `merge=ours` — is left alone entirely: gitattributes resolves repeated
  lines for one pattern by "last one wins", so appending a second `merge=`
  line would silently override rather than coexist. Recognizing "already
  declared" needed a real tokenizer (`hasMergeDeclaration`) rather than
  exact-string matching against the line this module writes — the first cut
  missed a tab or doubled space between tokens (false negative, a harmless
  duplicate line) and could never recognize a user's own `merge=ours` as a
  decision already made (the one case where appending anything is wrong).
- **A `.gitattributes` that fails to _read_ is never treated as "missing".**
  The first cut folded every `readFile` failure — permissions, a transient
  `EMFILE`, the path being a directory — into "doesn't exist yet" and took
  the create branch, which is a truncating write: a real `.gitattributes`
  hit by a transient read error would be silently replaced with just the
  union-merge line. Only `ENOENT` means missing; anything else is reported
  as a failure and the file is left exactly as it was. The create branch
  also uses `wx` (exclusive create) rather than a plain write, so a
  concurrent writer that created the file between the read and this write
  fails loudly into the same best-effort catch instead of the second writer
  truncating the first one's file.
- **Union merge does not preserve line order, so `kb_log`'s reader sorts by
  `at` rather than trusting file order.** Sorting there, once, is cheaper
  than trying to make every future merge order-preserving. `at` is now
  validated as an actual ISO-8601 timestamp (`z.iso.datetime()`, matching
  exactly what `record()` writes) rather than any non-empty string — a value
  that parses as JSON and matches the schema's shape but isn't really a
  timestamp would otherwise sort unpredictably instead of failing, and
  `parseLog` already has a place for "well-formed but wrong" to go: reported
  as malformed, same as any other schema mismatch, never silently repaired.
- **A union merge can keep the exact same line twice** — a cherry-pick or
  rebase that carried one worktree's entry into the other's history before
  the merge, not two independent writes agreeing by chance: `record()` mints
  its own `at` per call, so two entries equal on every field including `at`
  cannot be genuine. `parseLog` dedupes entries that are byte-for-byte equal
  after parsing and keeps everything else, including two entries that agree
  on every field except `at` — that pair is two real events. The
  alternative — leave duplicates visible and call it "genuine repeat
  ambiguity" — was rejected: there's no ambiguity to preserve, since the
  only way to produce an exact duplicate is the merge itself.
- **A read-then-append race across processes on the append branch — two
  processes both reading a `.gitattributes` without the line, both
  appending it — is left unguarded, not a reason to lock.** `appendFile` is
  `O_APPEND`, so the outcome is two copies of the same line, never a torn
  write, and `hasMergeDeclaration` sees a duplicate declaration as "already
  declared" on the very next call. Cheap residue, not corruption — the same
  trade the lock-file alternative above was rejected for, at a smaller
  scale.

GitHub does not run merge drivers for a PR it merges server-side — see the
README's "Cross-worktree writes" section. The driver only helps a merge a
local git client actually performs.

## Rejected for now: a base registry

Cross-base questions are unaskable: supersession, traces, and search stop at the
directory boundary. That is the price of a base that can be copied or handed
over whole, and it keeps the search index disposable.

The cheap escape, if that becomes the common case, is a registry: paths a caller
names explicitly, queried one at a time and merged only for display.
