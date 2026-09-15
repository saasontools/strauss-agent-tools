# @saasontools/code-diff

Diffs, hunks, changed symbols and file classes from a git range. Diff and git
code only: a knowledge base supplies its own claims as declarations. Every git
call goes through [`@saasontools/git-guard`](../git-guard/README.md).

| Export                                                                      | What it does                                                                     |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `readRangeDiff(root, "<base>..<head>")`, `readWorkingDiff(root, base)`      | A zero-context patch, or the reason there is none                                |
| `parseUnifiedDiff(patch, options)`                                          | Files and hunks; `withLines`, `withContext`, `keepEmpty`                         |
| `changedFiles`, `commits`, `uncommittedPaths`, `head`, `toplevel`, `digest` | Range reads; null when git could not answer                                      |
| `changedSymbols(file, declarations?)`                                       | The smallest declaration holding each hunk; git's function context with no parse |
| `classifyFiles(root, files, { base, declared })`                            | One of nine classes per file, with what declared it                              |
| `draftGitattributes(root)`                                                  | Starter `.gitattributes` lines, as text; never writes the file                   |

The classes, their precedence and the attribute mapping are documented once, at
[`classify`](https://saasontools.github.io/strauss-agent-tools/cli-reference#classify).

## Starter `.gitattributes`

```gitattributes
pnpm-lock.yaml strauss-class=lockfile
.github/** strauss-class=ci
*.spec.* strauss-class=test
*.test.* strauss-class=test
**/dist/** linguist-generated
**/vendor/** linguist-vendored
```

`draftGitattributes` proposes the lines that fit what the index holds.

MIT
