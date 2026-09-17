---
"@saasontools/strauss-kb": patch
---

Every consumer of the edge graph reads both halves of a reference — a markdown
citation in the prose and a `strauss_links` entry. `sweep` keeps a record cited
only from a surviving record's body, where it used to delete it; `validate`
warns on a prose citation of a record the bundle does not hold; `doctor`'s
`superseded-but-cited` and `orphaned` see typed links, and a
`superseded-but-cited` finding carries the edge as `reference`. `reassess`
answers with no code drift at all: `packet.references.outgoing` is what the
record points at that no longer holds, `incoming` is who still points at a
record that has itself been replaced.
