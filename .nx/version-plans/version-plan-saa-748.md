---
"@saasontools/strauss-kb": patch
---

`classify` reads a generated-file banner out of every file in a range, and
`match` and `classify` over the same range each resolved its symbols
separately. Banner reads are now cached per blob — by path, size and mtime
within a process, and across runs under `~/.strauss/cache/classify`
(`STRAUSS_KB_CACHE_DIR`, `off` to keep the on-disk half out of it). Over one
range the two commands now resolve each file's symbols once between them.
