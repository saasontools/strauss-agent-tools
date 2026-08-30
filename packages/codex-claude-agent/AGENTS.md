# Codex Claude Agent Engineering Guide

These rules apply to `packages/codex-claude-agent/**`. The plugin that
fronts this runner lives in `plugins/codex-claude-agent`; the two release on
different tracks and the repository-level `AGENTS.md` covers that split.

## Module structure

- Keep job behavior in the `src/jobs/` folder module. `src/jobs/index.ts` is a behavior-free public export surface.
- Split job responsibilities by reason to change: paths, ownership, locking, storage, events, processes, lifecycle, catalog, and retention. Add a focused module when a new responsibility does not fit one of those boundaries; do not recreate a monolithic `jobs.ts`.
- Consumers outside `src/jobs/` import the public API through `src/jobs/index.ts`. Modules inside the folder import the owning sibling module directly.
- Put reusable, cross-cutting filesystem primitives in `src/utils/`. Use `readFileNoFollow` and `writeFileAtomically` from `src/utils/secure-files.ts` instead of reimplementing secure reads or temporary-file, fsync, and rename sequences.
- Preserve the secure-file invariants: exclusive temporary creation, no symlink following, mode `0600`, fsync before rename, and cleanup on failure. Responsibility-specific directory and destination checks stay with the caller.

## Compatibility and safety

- Preserve the public CLI flags, package exports, job artifact schemas, event shapes, and result rendering unless all consumers are migrated in the same change. The plugin's skill and hooks are such a consumer, and they ship from a directory this package cannot import: `test/plugin.spec.ts` is where the two are checked against each other.
- Treat job artifacts and prompts as sensitive. Do not log raw prompts, tool inputs, tool results, API keys, session IDs, or credential-bearing payloads.
- Process cancellation requires verified process identity and a dedicated child process. Never signal a shared host process.

## Commands

npm scripts are the source of truth here; Nx infers its targets from them.
From this directory:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Or through Nx from the repository root, which caches:

```bash
pnpm nx run-many -t lint typecheck test build -p @saasontools/codex-claude-agent
```

For job lifecycle, filesystem, or process changes, run the complete package test target; typechecking alone is not sufficient.
