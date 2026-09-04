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
whole thing.

The package is that directory's **library**, its **command line**, and its
**MCP server**. All three project one command table, so a capability exists in
every surface or in none.

## The problem

An agent session forgets: attention decays, and compaction summarises away both
the material loaded early and the instruction that said to consult it. Two
failures follow:

- **Re-deciding.** A constraint settled last week is invisible this week, so it
  gets "simplified" away, and the diff does not record which alternative was
  rejected.
- **Acting on stale conclusions.** A superseded record is usually the older,
  longer, more general one, so any similarity measure favours the record that is
  no longer true.

So every result arrives **flagged, never filtered**: a superseded record comes
back alongside whatever replaced it, and a rejected one is marked as explicitly
_not_ adopted.

## What a base looks like

```
<kb>/
  <type>.<slug>.md    records
  INDEX.md            index      derived, store-owned
  log.jsonl           history    primary, append-only
  .gitattributes      merge      store-owned, written on first write
  .index.sqlite       search     derived, gitignored
```

The default base is `.strauss/kb` relative to the working directory; every
command takes `--bundle PATH` to address another. Records are
[OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog) concepts, and
the filename is the identity: `fact.auth-retries.md` has concept id
`fact.auth-retries`.

## The three surfaces

| Surface    | Entry point                                         | Who uses it                                   |
| ---------- | --------------------------------------------------- | --------------------------------------------- |
| CLI        | `strauss-kb`                                        | agent skills shelling out by name, and humans |
| MCP server | `strauss-kb-mcp` (stdio)                            | any MCP client                                |
| Library    | `import { KbStore } from "@saasontools/strauss-kb"` | programmatic callers, diff annotation         |

The table holds 24 verbs and projects 23 of them as MCP tools; the one verb with
no tool is `sync-instructions`, whose capability is `kb_context`.

```bash
npm install -g @saasontools/strauss-kb
```

Global install is the supported path: the consumers of the CLI are agent skills
that invoke `strauss-kb` by name from whatever directory the work happens to be
in. `npx -y @saasontools/strauss-kb@0.1` and a project-local `pnpm add -D` both
work, at the cost of per-call resolution latency.

## Read for a question, not for a session

The counter-intuitive default: **load the whole base rather than searching it.**
These bases run to a few thousand tokens, and on nine questions whose wording
appears in no record, a reader holding the whole base answered eight where
embedding search over the same records answered four. Read it **at the point of
use**: reloading costs about three thousand tokens.

### The three rungs, in one rule

`load` the base whole. When it refuses on budget,
[`catalog`](./cli-reference.md#catalog) then
[`pack`](./cli-reference.md#pack) the record that matters. For a lookup by
wording, [`query`](./cli-reference.md#query).

```bash
strauss-kb load                          # everything, with standing
strauss-kb catalog                       # if load refuses: one line per record, ~30 tokens each
strauss-kb pack decision.cursor-v2       # then the neighbourhood around the one that matters
strauss-kb query cursor pagination       # or a point lookup by wording
```

A whole read gives perfect recall and can say _no record answers this_. A
catalog keeps that second property and gives up the bodies. A query gives up
both: it returns its nearest hit whatever the distance. `load` holds a
25,000-token budget and **refuses rather than truncating** past it.

## Where to go next

- [Specification](./specification.md) — the record model, the bundle layout, and
  the validation rules.
- [Architecture](./architecture.md) — why it is shaped this way, and which
  alternatives were dropped.
- [Use cases](./use-cases.md) — recording, querying, superseding, verifying,
  tracing, loading into agent context, packing a subgraph.
- [CLI reference](./cli-reference.md) — every verb, its flags, and an example.
- [MCP reference](./mcp-reference.md) — every tool and its parameters.
