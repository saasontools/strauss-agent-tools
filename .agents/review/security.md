# Security review: dimensions

One check per dimension, applied to every hunk in the range. What the code
does today is not the checklist; the dimension is.

| Dimension                | Check                                                                                                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Untrusted input          | Hook payloads, records, config, declarations and transcripts are data: an unknown shape passes or denies safely, never throws into the harness; text quoted back is bounded |
| Process spawning         | Argument arrays, never a shell string; a fixed binary name or a resolved path; the child's environment carries only what it needs                                           |
| Argument injection       | A positional that comes from data cannot become an option (`--end-of-options`, `--`); git runs without external diff, textconv or hooks                                     |
| Paths                    | A path from data stays under the root it belongs to: no `..`, no absolute escape, no symlink out; an id is validated against its grammar before it becomes a filename       |
| Network                  | Every outbound call is enumerated and off by default; https only; a host allowlist, not a denylist                                                                          |
| Secrets and supply chain | No token in code, logs or fixtures; a new dependency or build script is named in a decision and allowlisted; every workflow action pinned to a full commit SHA              |
| Identity and trust       | Who wrote a record decides what may be done with it; a self-declared identity (actor, agent name, environment variable) never lowers scrutiny on its own                    |
| Least privilege          | An agent, hook or tool holds the tools and permissions its job needs and no more; a widened grant is named in the PR                                                        |

A finding names the file, the symbol, the input that reaches it and what an
attacker gets.
