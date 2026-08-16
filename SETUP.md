# SETUP — manual steps requiring credentials or web UIs

Everything below needs an account, a token, or a browser; automation can't do
it for you. Do these once, in order.

## 1. GitHub repository settings

Repo: <https://github.com/saasontools/strauss-agent-tools> → Settings

**Branch protection** (Settings → Branches → Add rule for `main`, or a
ruleset):

- Require a pull request before merging, with at least 1 review
- Require status checks to pass: `Lint, typecheck, test, build (affected)`,
  `Build (windows-latest)`, `Build (macos-latest)`, `Analyze
JavaScript/TypeScript`, `dependency-review`
- Block force pushes; restrict deletions

**Security & analysis** (Settings → Code security):

- Enable **private vulnerability reporting** (SECURITY.md points at it)
- Enable **Dependabot alerts** and **Dependabot security updates**
  (`.github/dependabot.yml` handles version updates)
- Code scanning: **switch CodeQL from "Default" to "Advanced" setup**
  (Settings → Code security → Code scanning → CodeQL analysis). The repo
  currently has default setup enabled, which rejects SARIF from this repo's
  own `codeql.yml` with "CodeQL analyses from advanced configurations cannot
  be processed when the default setup is enabled" — the workflow cannot pass
  until default setup is disabled. Scorecard's SARIF upload is unaffected.

**Features** (Settings → General):

- Enable **Discussions** — SUPPORT.md and the issue-form config link to it

## 2. npm bootstrap (do this before the first release, or `release.yml` fails)

OIDC trusted publishing cannot create a package — the trusted-publisher
setting lives in the package's npmjs.com settings, which only exist after the
package exists. For **each** package below:

1. One-time manual publish of `0.1.0` (from the repo, logged in to npm as an
   owner of the `@saasontools` org — create the org first if it doesn't
   exist):

   ```bash
   pnpm nx run-many -t build
   cd packages/<name>
   npm publish --access public
   ```

2. On npmjs.com → the package → **Settings → Trusted publisher**:
   GitHub Actions / owner `saasontools` / repository `strauss-agent-tools` /
   workflow `release.yml` (no environment).

3. Nothing else — after this, `release.yml` publishes via OIDC with automatic
   provenance (no tokens, no `--provenance` flag).

Packages needing the bootstrap today:

- [ ] `@saasontools/nx-plugin`
- [ ] `@saasontools/gemini-deep-research-mcp`
- [ ] `@saasontools/strauss-kb` — publish before its version plan merges, or
      that release run fails for this package alone while the others succeed

Every future `nx g @saasontools/nx-plugin:mcp-server` package needs the same
two steps once. This is the step that otherwise fails mysteriously in CI
([npm/cli#8544](https://github.com/npm/cli/issues/8544)).

## 3. Official MCP registry

For each `packages/*/server.json` (`gemini-deep-research-mcp` and
`strauss-kb`), after its npm package is live:

```bash
cd packages/<name>
mcp-publisher login github-oidc
mcp-publisher publish
```

The `io.github.saasontools/*` namespace is proven by the GitHub OIDC login.

## 4. Verify the marketplaces

In a scratch Claude Code session:

```
/plugin marketplace add saasontools/strauss-agent-tools
/plugin install gemini-deep-research@saasontools
/plugin install strauss-kb@saasontools
```

And in Codex, add this repository as a marketplace (it reads
`.agents/plugins/marketplace.json`) and install the same two.

`strauss-kb` also needs `npm i -g @saasontools/strauss-kb` — its `.mcp.json`
launches `strauss-kb-mcp` off the global install rather than through `npx`,
so that the server and the CLI its skills shell out to are one version.

## 5. Scorecard badge

The README badge at
`https://api.scorecard.dev/projects/github.com/saasontools/strauss-agent-tools/badge`
goes live after `scorecard.yml` first runs on `main` with
`publish_results: true` (already configured). No action beyond merging.
