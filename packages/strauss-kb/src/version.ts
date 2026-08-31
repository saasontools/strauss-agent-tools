/**
 * The package version, injected at build time by tsup's `define`.
 *
 * Hardcoding it here would be a second copy of `package.json`'s version, and a
 * copy that only a human comparing two numbers would ever catch: it reaches
 * users as `serverInfo.version`, which is the one thing a client can ask a
 * running server about itself. It sat at 0.1.0 through five releases.
 *
 * `typeof` rather than a bare reference so this also works unbuilt — under
 * Vitest the identifier is never defined, and reading an undeclared name would
 * throw where reading its type does not.
 */
declare const __STRAUSS_KB_VERSION__: string | undefined;

export const VERSION: string =
  typeof __STRAUSS_KB_VERSION__ === "string"
    ? __STRAUSS_KB_VERSION__
    : "0.0.0-dev";
