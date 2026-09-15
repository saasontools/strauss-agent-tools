# @saasontools/git-guard

One way to run git on data you did not write: argv only, no shell, the
repository-redirecting `GIT_*` variables stripped, prompts off, output and time
bounded, and every rev and path shape-checked before it reaches argv.

```ts
import { checkAttr, runGit, showAtRev } from "@saasontools/git-guard";

const run = await runGit(["rev-parse", "HEAD"], { cwd: repo });
const old = await showAtRev(repo, base, "src/pay.ts");
const { attrs, pinned } = await checkAttr(repo, base, paths, [
  "linguist-generated",
]);
```

| Export                                                                           | What it does                                                                           |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `runGit(args, options)`                                                          | One run; a failure is `{ ok: false, reason }`, never a throw                           |
| `gitEnv()`                                                                       | The child environment `runGit` uses                                                    |
| `showAtRev(cwd, rev, file)`                                                      | `cat-file blob <rev>:<file>`, or null                                                  |
| `checkAttr(cwd, source, paths, names)`                                           | Attributes at `source` in one batched call; `pinned: false` when the worktree answered |
| `refShapeIsSafe`, `localRevShapeIsSafe`, `filePathIsSafe`, `attributeNameIsSafe` | The shape checks, with no subprocess                                                   |

`runGit` does not insert `--end-of-options`; put untrusted positionals after it
or after `--`.

MIT
