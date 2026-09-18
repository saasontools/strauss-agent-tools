---
"@saasontools/strauss-kb": major
---

`strauss_links` is the one representation of an edge, and a markdown link in a
record's body is its rendering.

**After upgrading, run `strauss-kb mirror-links` once per base.** The new
one-time migration copies every prose citation into `strauss_links` as
`related_to`, wherever the frontmatter does not already name that target. Until
it runs, `sweep` refuses the base and names the records, and every other read
under-reports the edges that lived only in prose.

`compose` now stores `relatedConceptIds` as `related_to` links as well as
rendering the sentence, so a new record cannot regress. `body-link` leaves
`KbEdgeKind`, and `sweep`, `doctor`, `reassess` and `pack` read frontmatter
alone; `doctor`'s `superseded-but-cited` sees typed links, names the rels, and
carries the edge as `reference`; `reassess` answers with no code drift at all,
through `packet.references`. `validate` keeps the only body read: a citation
`strauss_links` does not declare is a warning naming the migration.
