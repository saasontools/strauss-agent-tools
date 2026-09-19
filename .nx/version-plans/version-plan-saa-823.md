---
"@saasontools/strauss-kb": major
---

**Breaking:** the `test-obligation` record type is retired. `kb_types` lists
eleven types, and a write of `test-obligation` is refused with a message naming
what replaces it: an author answers a risk in the reviewer's rerun brief, and a
deferred test is `it.todo` in its spec. `list`, `query` and `catalog` reject
`--type test-obligation`. A base still holding one reports it as an
unrecognised type; delete the record.
