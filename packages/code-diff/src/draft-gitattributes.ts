import { runGit } from "@saasontools/git-guard";

const LOCKFILES = [
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "Cargo.lock",
  "go.sum",
];

const CI_DIRS = [".github", ".circleci", ".buildkite"];

const BUILT: readonly [dir: string, attribute: string][] = [
  ["dist", "linguist-generated"],
  ["build", "linguist-generated"],
  ["vendor", "linguist-vendored"],
];

/**
 * Starter `.gitattributes` lines for what the index holds, as text; never
 * writes the file. Null when git cannot list the repository.
 */
export async function draftGitattributes(
  repoRoot: string,
): Promise<string | null> {
  const listed = await runGit(["-C", repoRoot, "ls-files", "-z", "--cached"], {
    maxBytes: 64 * 1_048_576,
    timeoutMs: 20_000,
  });
  if (!listed.ok) return null;
  return draftGitattributesFrom(listed.stdout.split("\0").filter(Boolean));
}

/** The same draft over a path list. `node_modules` is never proposed. */
export function draftGitattributesFrom(paths: readonly string[]): string {
  const kept = paths.filter(
    (path) => !path.split("/").includes("node_modules"),
  );
  const names = new Set(kept.map((path) => path.split("/").pop() ?? ""));
  const dirs = new Set(kept.flatMap((path) => path.split("/").slice(0, -1)));
  const top = new Set(
    kept.filter((path) => path.includes("/")).map((path) => path.split("/")[0]),
  );
  const lines: string[] = [];

  for (const name of LOCKFILES) {
    if (names.has(name)) lines.push(`${name} strauss-class=lockfile`);
  }
  for (const dir of CI_DIRS) {
    if (top.has(dir)) lines.push(`${dir}/** strauss-class=ci`);
  }
  if (kept.includes(".gitlab-ci.yml")) {
    lines.push(".gitlab-ci.yml strauss-class=ci");
  }
  if (dirs.has("__tests__")) lines.push("**/__tests__/** strauss-class=test");
  for (const kind of ["spec", "test"]) {
    if ([...names].some((name) => name.includes(`.${kind}.`))) {
      lines.push(`*.${kind}.* strauss-class=test`);
    }
  }
  for (const [dir, attribute] of BUILT) {
    if (dirs.has(dir)) lines.push(`**/${dir}/** ${attribute}`);
  }
  return lines.length ? `${lines.join("\n")}\n` : "";
}
