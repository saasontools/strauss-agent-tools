# Contributing

Thanks for helping out. This page covers dev setup, adding packages, and how
releases work.

## Dev setup

Requirements: Node >= 22.14 (see `.nvmrc`) and pnpm 11 (`corepack enable` is
enough — the `packageManager` field pins the exact version).

```bash
pnpm install
pnpm build
pnpm test
```

You can also work on a single package without ever touching Nx:

```bash
cd packages/gemini-deep-research-mcp
pnpm install
pnpm build
pnpm test
```

Nx is an optimization layer (task caching, `affected` in CI), not a
requirement. Packages have no `project.json`; plain npm scripts are the
source of truth and Nx infers its targets from them. Please keep it that way
when adding scripts.

## Adding a package or plugin

Use the generators — they encode all the conventions (dual tsup configs, the
MCPB `createRequire` shim, smoke tests, registry manifests):

```bash
# Build the plugin first; generators run from its compiled output.
pnpm nx run @saasontools/nx-plugin:build

# A new MCP server package under packages/
pnpm nx g @saasontools/nx-plugin:mcp-server my-server --description "..." --apiKeyEnv MY_API_KEY

# A new agent plugin under plugins/ (also registers it in both marketplaces)
pnpm nx g @saasontools/nx-plugin:agent-plugin my-plugin --mcpServer my-server --apiKeyEnv MY_API_KEY
```

### Versioning

**Every publishable package starts at `1.0.0`, never `0.x`.** Nx release
compresses `minor` bumps to `patch` below 1.0 (a `minor` plan on `0.1.0`
produces `0.1.1`), so 0.x versioning silently breaks semver expectations.
The generators enforce this; don't undo it by hand.

### First publish is manual

npm trusted publishing (OIDC) is configured per package on npmjs.com, and the
settings page only exists once the package exists. For every **new** package:

1. `npm publish --access public` version `1.0.0` once, by hand (or with a
   granular token).
2. On npmjs.com → package → Settings → Trusted publisher: GitHub Actions,
   owner `saasontools`, repository `strauss-agent-tools`, workflow
   `release.yml`.
3. From then on, `release.yml` publishes it via OIDC with automatic
   provenance.

Skipping step 1 makes the release workflow fail mysteriously for that one
package while others succeed.

## Releasing

Releases are driven by **version plans**, not commit messages. Commitlint
keeps commit hygiene, but nothing parses commits to decide versions.

1. Make your change.
2. Run `pnpm nx release plan` and pick a bump (`patch` / `minor` / `major`)
   for each affected package. This writes a markdown file under
   `.nx/version-plans/` — commit it with your PR.
3. When the PR merges, `release.yml` picks up the plan: versions, changelogs,
   tags, GitHub releases, npm publish, and MCPB bundle artifacts.

Do not add Changesets, Lerna, or any other release tooling — running two
release systems against one repo is the failure mode this setup avoids.

## Code style

- ESLint 9 (flat config) + Prettier, enforced by lint-staged on commit.
- Conventional commit messages (commitlint) — for hygiene and readable
  history only; release automation does not read them.
- TypeScript strict mode; ESM everywhere except the Nx plugin itself (Nx
  loads generators as CommonJS).

## Tests

- Unit tests with Vitest, colocated as `src/**/*.spec.ts`.
- Every MCP server keeps an MCP handshake smoke test (`test/smoke.spec.ts`)
  that spawns the **built** binary, completes `initialize`, and checks
  `tools/list`. Run it against the MCPB bundle with
  `SMOKE_ENTRY=bundle/server/index.js pnpm test`.
- `pnpm nx affected -t lint typecheck test build` is what CI runs — if that
  passes locally, CI agrees.
