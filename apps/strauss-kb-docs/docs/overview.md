---
id: overview
title: Overview
sidebar_label: Overview
sidebar_position: 1
slug: /
description: What strauss-kb is, and the problem it solves for agent workflows.
---

# strauss-kb

`@saasontools/strauss-kb` is a durable project knowledge base: a directory of
small markdown records, each carrying not just a claim but its **standing** —
whether it is still what the project holds. Copy the directory and you have the
whole thing. Nothing outside it is needed to read, search, adjudicate, or trace
it.

The package is that directory's **library**, its **command line**, and its
**MCP server**. All three project one command table, so a capability exists in
every surface or in none.

## The problem

An agent session forgets. Attention decays over a long conversation, and
compaction summarises away both the material loaded early and the instruction
that said to consult it. Two failures follow, and they are the ones this package
exists to remove:

- **Re-deciding.** A constraint settled last week is invisible this week, so it
  gets "simplified" away. The diff does not record which alternative was
  rejected, and nothing else does either.
- **Acting on stale conclusions.** A search returns the record that matches
  best, which is systematically the wrong one: a superseded record is usually
  the older, longer, more general one, and its replacement is usually a
  narrowing. Any similarity measure favours the record that is no longer true.

A search engine answers "does this match?". A knowledge base also has to answer
"is this still what we hold?" — and those two questions disagree in a
predictable direction. So every result here arrives **flagged, never filtered**:
a superseded record comes back alongside whatever replaced it, and a rejected
one is marked as something explicitly _not_ adopted.

## What a base looks like

```
<kb>/
  <type>.<slug>.md    records
  INDEX.md            index      derived, store-owned
  log.jsonl           history    primary, append-only
  .index.sqlite       search     derived, gitignored
```

The default base is `.strauss/kb` relative to the working directory; every
command takes `--bundle PATH` to address another. A scratch base under a
worktree and a committed base versioned beside the code it describes are the
same format with different lifetimes — nothing promotes one to the other.

Records are [OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog)
concepts. The filename is the identity: `fact.auth-retries.md` has concept id
`fact.auth-retries`. One record per file, so parallel writers never merge — they
only choose distinct names.

## The three surfaces

| Surface    | Entry point                                         | Who uses it                                   |
| ---------- | --------------------------------------------------- | --------------------------------------------- |
| CLI        | `strauss-kb`                                        | agent skills shelling out by name, and humans |
| MCP server | `strauss-kb-mcp` (stdio)                            | any MCP client                                |
| Library    | `import { KbStore } from "@saasontools/strauss-kb"` | programmatic callers, diff annotation         |

The command table holds 22 verbs and projects 21 of them as MCP tools. The one
verb with no tool is `sync-instructions` — file plumbing for hooks rather than
an agent capability, and the capability it serves is `kb_context`.

```bash
npm install -g @saasontools/strauss-kb
```

Global install is the supported path: the consumers of the CLI are agent skills
that invoke `strauss-kb` by name, many times per session, from whatever
directory the work happens to be in. `npx -y @saasontools/strauss-kb@0.1` and a
project-local `pnpm add -D` both work and are both pinned, at the cost of
per-call resolution latency and of `strauss-kb` not resolving as one spelling
everywhere.

## Read for a question, not for a session

The counter-intuitive default: **load the whole base rather than searching it.**
These bases run to a few thousand tokens — twenty records measured at about
3,000 — and on nine questions whose wording appears in no record, a reader
holding the whole base answered eight where embedding search over the same
records answered four. Two of those differences are structural rather than
matters of degree: a reader can say _no record answers the question_, where
vector search returns its nearest neighbour whatever the distance; and a reader
picks the record that answers the question rather than the one nearest the
topic.

And read it **at the point of use**. A base loaded at the start of a long
conversation is summarised away by the end of it; reloading costs about three
thousand tokens, which is cheaper than being wrong.

When a base outgrows a context there are two rungs down, in order:
[`pack`](./cli-reference.md#pack) hands over one record's bounded neighbourhood,
and [`query`](./cli-reference.md#query) is the point lookup.

## Where to go next

- [Specification](./specification.md) — the record model: frontmatter, types,
  standing, supersession, verification, the bundle layout, and the validation
  rules.
- [Architecture](./architecture.md) — why it is shaped this way, and which
  alternatives were tried and dropped.
- [Use cases](./use-cases.md) — recording a decision, querying before deciding,
  superseding, verifying, tracing, loading into agent context, packing a
  subgraph.
- [CLI reference](./cli-reference.md) — every verb, its flags, and an example.
- [MCP reference](./mcp-reference.md) — every tool and its parameters.
