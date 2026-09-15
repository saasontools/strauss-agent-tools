/**
 * Variables that point git at another repository, index or object store than
 * the one `cwd` addresses, or that run a command the environment chose.
 */
const REDIRECTS = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_NAMESPACE",
  "GIT_EXTERNAL_DIFF",
] as const;

/**
 * A git child's environment: redirects removed, prompts off. Config and
 * credential variables stay — the user's own helper lives there.
 */
export function gitEnv(
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base, GIT_TERMINAL_PROMPT: "0" };
  for (const name of REDIRECTS) delete env[name];
  return env;
}
