# AGENTS.md

Guidance for AI coding agents working in this repository. Client-specific
files (CLAUDE.md, etc.) point here; keep this file the single source of truth.

## What this repo is

Nx + pnpm monorepo publishing MCP servers and agent plugins under the
`@saasontools` npm scope. `packages/*` are npm packages; `plugins/*` are plain
plugin directories (manifests + markdown, no build) served to Claude Code,
Codex, and Agent Plugins 1.0 clients from the marketplace files at
`.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json`.

## Commands

- `pnpm nx run-many -t lint typecheck test build` — everything CI checks
- `pnpm nx run-many -t validate` — `claude plugin validate` over `plugins/*`
- Single package, no Nx needed: `cd packages/<name> && pnpm build && pnpm test`
- Single test file: `cd packages/<name> && pnpm vitest run src/server.spec.ts`
- MCPB bundle check: `pnpm build:bundle && SMOKE_ENTRY=bundle/server/index.js pnpm test`

## Rules that are load-bearing

- **No `project.json` under `packages/*`** — Nx infers targets from npm
  scripts; keep scripts the source of truth. Only `plugins/*` carry a
  `project.json`: every plugin for its `validate` target, plus `lint` (and
  `typecheck`, where the scripts are `// @ts-check`ed) for every plugin that
  ships executable scripts. A shipped script with no target is a file CI never
  looks at.
- **Markdown under `packages/*` is documentation, never a build input** — CI
  skips build/test/typecheck on docs-only changes through two Nx layers, and
  both are needed: `noMarkdown` in `nx.json` keeps markdown out of a task's
  _hash_, while `.nxignore` keeps it out of _affectedness_ (which is path-based
  and ignores target inputs entirely). `build`, `test`, `typecheck` **and**
  `lint` all inherit `noMarkdown` from `targetDefaults`, so a project that
  needs its markdown back must override every target that reads it, not just
  `build`. To add a project whose markdown is source:
  - **Under `packages/`** — you need _both_ halves. Add an explicit
    `!packages/<name>/**/*.md` negation line to `.nxignore` (after the
    `packages/**/*.md` line), _and_ override the target's `inputs` to
    `["default", "^noMarkdown"]` in the project's `nx` config. The negation
    alone only restores affectedness; the override alone only restores the
    hash.
  - **Outside `packages/`** — `.nxignore` never matched it, so only the
    `inputs` override matters. `apps/strauss-kb-docs` is the worked example.
- **New packages start at `0.1.0`** — the generators do this. Below 1.0 Nx
  shifts every relative bump down a level (`patch` and `minor` both give
  `0.1.1`, `major` gives `0.2.0`), so write plans as `patch` and reach 1.0.0
  with an explicit `nx release version 1.0.0 -p <pkg>`. See CONTRIBUTING.md.
- **Releases run on version plans** (`pnpm nx release plan`), never on commit
  messages. Do not add Changesets/Lerna/Turborepo.
- **A new package's first npm publish is manual** (OIDC trusted publishing
  can't create a package) — see CONTRIBUTING.md.
- Scaffold with the generators, not by hand: `pnpm nx g
@saasontools/nx-plugin:mcp-server <name>` / `:agent-plugin <name>` (build
  the plugin first: `pnpm nx run @saasontools/nx-plugin:build`).
- **Every GitHub Action stays pinned to a full commit SHA** (zizmor policy),
  and workflow permissions start from `permissions: {}`.
- **pnpm build scripts are an explicit allowlist** (`allowBuilds` in
  pnpm-workspace.yaml) — a new dep with a build script fails cold installs
  until it is listed there.
- **A package may add a scoped `AGENTS.md`** for rules that only hold inside
  it — `packages/codex-claude-agent/AGENTS.md` carries the job-module and
  secure-file invariants of that runner. Scoped, never contradicting: anything
  that applies repo-wide belongs in this file.
- **Multi-responsibility source files become folder modules.** When a file
  under `src/` accumulates more than one responsibility, split it into a
  directory of single-responsibility modules (`model.ts` for types/schemas,
  `errors.ts`, one file per operation or command) with an `index.ts` barrel
  that re-exports the public surface — see `packages/strauss-kb/src/kb-pins/`
  and `src/commands/`. Importers point at the barrel (`./kb-pins/index.js`);
  no compatibility re-export file is left at the old path.
