# Correctness review: dimensions

One check per dimension, applied to every hunk in the range. What the code
does today is not the checklist; the dimension is.

| Dimension                 | Check                                                                                                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| State and concurrency     | A write that can race reads its version first and refuses on a stale one; a retry is idempotent; nothing another reader depends on is rewritten in place              |
| Failure handling          | Every failure reaches the caller or the log, never swallowed; an unreadable input degrades to a warning, not a crash and not a silent pass                            |
| Boundaries                | An external shape (CLI flags, JSON keys, MCP inputs, hook payloads) gains fields and never loses or renames one; a read verb writes nothing                           |
| Parsing and serialisation | Malformed input is reported with its location; a round trip through the format is lossless; ordering and deduplication are stated, not accidental                     |
| Edge cases                | Empty, one, many; a missing file or key; a cycle or a fork in a chain; the first and last element of a range                                                          |
| Attribution               | A hunk, a rename or a moved symbol is credited to the path and symbol it lives on after the change, and the old location is still findable                            |
| Tests                     | A test asserts what its name says; a skipped or silenced test is named in the PR; a golden or fixture changes only with a stated reason                               |
| Claim against code        | The PR description, the companion's decisions and risks, and the code agree; a claim the code does not show is a finding, and so is a change no record or PR explains |

A finding names the file, the symbol, the input that breaks it and what the
code then does.
