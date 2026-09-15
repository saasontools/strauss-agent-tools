# Prose review: what to check in this repository

The rules are AGENTS.md's "Prose is terse". Per surface:

| Surface                                      | Check                                                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP tool `description` and zod `.describe()` | One sentence for what, one for when over its neighbour, at most one constraint; ≤ 60 words; the server's descriptions ≤ 800 tokens in total |
| `SKILL.md`                                   | Only what an agent needs at the moment of use; no rationale, no history; a reference file for shapes and examples                           |
| README, docs site                            | The rule and at most one reason; one home per fact — the site is the reference, the README links; nothing restated from a second angle      |
| CLI help, hook messages, error text          | Says what happened and what to do next, in one line where possible; quotes the record or path, never a paragraph                            |
| Code comments                                | The invariant, ≤ 4 lines; the why lives in `ARCHITECTURE.md` or a KB record                                                                 |
| Commit messages and PR bodies                | The change and the reason; no narration of the work                                                                                         |

Cut on sight: "deliberately", "which is what…", closing morals, a sentence that justifies the previous one, a fact stated in two files. A finding is the file and line, the rule, and the shorter text.
