# Knowledge base doctrine

This workspace keeps durable knowledge in strauss-kb bases — directories of
markdown records carrying standing, supersession, and history.

- The "Knowledge bases (pinned)" block at the top of context is an **index** —
  concept ids, titles, standing. The record bodies are NOT in context.
- Read records only through the strauss-kb MCP tools: `kb_load` (preferred
  first call), `kb_query`, `kb_trace`. Never read record files directly: a raw
  file read bypasses supersession resolution, and a superseded or rejected
  record file reads exactly like a current one.
- Load at the point of use, not once per session. KB content loaded earlier
  may have been compacted away; before answering a question a base governs,
  load it again. Never conclude "nothing was decided" from a context that has
  no KB content in it.
- Pin a base with `strauss-kb pin <path>` when a session should always see its
  index; `strauss-kb pins` lists what is pinned.
- Record what a later reader could not reconstruct from the code — decisions
  with their rejected alternatives, constraints, risks, open questions. An
  unsourced claim is an `assumption`, never a `fact` with a vague source.
