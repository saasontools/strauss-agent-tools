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
  `project.json`, and only for the `validate` target.
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
