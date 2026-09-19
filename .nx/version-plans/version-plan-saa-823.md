---
"@saasontools/strauss-kb": major
---

**Breaking:** the `test-obligation` record type is removed. `write`, `list`,
`query` and `catalog` reject it as a type, and a base still holding one reports
it as an unrecognised type; delete the record.
