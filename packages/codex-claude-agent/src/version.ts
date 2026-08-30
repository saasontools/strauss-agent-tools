/**
 * The package version, injected at build time by tsup's `define`.
 *
 * It reaches Anthropic as `CLAUDE_AGENT_SDK_CLIENT_APP`, the only field that
 * says which runner opened a session. A literal here would be a second copy of
 * `package.json`'s version, and the kind of copy nobody notices has gone stale.
 *
 * `typeof` rather than a bare reference so this also works unbuilt: under
 * Vitest the identifier is never defined, and reading an undeclared name would
 * throw where reading its type does not.
 */
declare const __CODEX_CLAUDE_AGENT_VERSION__: string | undefined;

export const VERSION: string =
  typeof __CODEX_CLAUDE_AGENT_VERSION__ === "string"
    ? __CODEX_CLAUDE_AGENT_VERSION__
    : "0.0.0-dev";
