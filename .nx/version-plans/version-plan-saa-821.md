---
"@saasontools/strauss-kb": major
---

`strauss_links` is the one representation of an edge, and a markdown link in a
record's body is its rendering.

`compose` now stores `relatedConceptIds` as `related_to` links as well as
rendering the sentence. `body-link` leaves `KbEdgeKind`, and `sweep`, `doctor`,
`reassess`, `pack` and `trace` read frontmatter alone, so a citation that lives
only in a record's prose is no longer an edge. `validate` keeps the only body
read: such a citation is a warning naming the record.

`doctor`'s `superseded-but-cited` sees typed links, names the rels, and carries
the edge as `reference`; `reassess` answers with no code drift at all, through
`packet.references`.
