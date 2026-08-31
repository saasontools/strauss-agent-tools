# Knowledge base doctrine

This workspace keeps durable knowledge in strauss-kb bases — directories of
markdown records carrying standing, supersession, and history.

- The "Knowledge bases (pinned)" block in context labels each base: **full
  records** means that base's contents are already here — use them directly,
  nothing to fetch. **Index only** means concept ids, titles, and one-line
  descriptions are here and the bodies are not. Small or critical bases are
  configured to arrive whole (`mode: full` in `.strauss/kb-pins.json`); the
  index form exists for bases too large to carry every turn.
- **The index lines are the trigger.** Before answering anything about a
  decision, constraint, requirement, or "why is this the way it is", scan the
  pinned block: if any index line's title or description touches the topic,
  `kb_load` that base first. If the block names no relevant base, say so
  rather than guessing — and never conclude "nothing was decided" when all
  you hold is an index line.
- Read records only through the strauss-kb MCP tools: `kb_load`, `kb_catalog`,
  `kb_pack`, `kb_query`, `kb_trace`. A raw file read bypasses supersession
  resolution, and a superseded or rejected record file reads exactly like a
  current one.
- When `kb_load` refuses, the base is past its record gate or its token
  budget — take the next rung down rather than raising the ceiling:
  `kb_catalog` for one line per record, then `kb_pack` on the record the work
  centres on. `kb_query` is the lookup by wording.
- Record what a later reader could not reconstruct from the code — decisions
  with their rejected alternatives, constraints, risks, open questions. An
  unsourced claim is an `assumption`, never a `fact` with a vague source.
