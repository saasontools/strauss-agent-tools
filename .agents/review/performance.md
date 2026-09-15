# Performance review: dimensions

One check per dimension, applied to every hunk in the range. What the code
does today is not the checklist; the dimension is.

| Dimension             | Check                                                                                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parallelism           | Independent work runs concurrently: subagents spawned in one message, independent processes and reads not awaited in sequence; a sequence only where a result feeds the next |
| Process and I/O count | One process per verb per event; nothing spawned or read inside a loop over hunks, records or files; a result asked for twice is memoised                                     |
| Hot paths             | The path that runs every turn or every commit (hooks, stamps, lookups) does the cheapest check first and short-circuits when nothing changed                                 |
| Bounds                | Every spawn sits under a timeout and a wall budget; buffers are bounded; a pathological input degrades to a warning, not a hang                                              |
| Caching and indexes   | A cache or index is keyed on its input and rebuilt only when that input changed; a budget refuses, never truncates silently                                                  |
| Complexity            | Nothing quadratic over records, hunks or files where the count grows with the repository                                                                                     |
| Startup               | A hook or CLI entry loads only what its branch needs: grammars, indexes and modules on demand                                                                                |
| Measurement           | A change on a hot path carries a number; a ceiling in a test is a smoke check and moves only with a measurement, never to make a test pass                                   |

A finding carries a measurement or names the missing one: "this adds a spawn
per hunk" is a finding; "this looks slow" is not.
