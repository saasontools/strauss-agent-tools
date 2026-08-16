# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->
