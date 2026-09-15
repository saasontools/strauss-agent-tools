import { z } from "zod";
import { bundlePath, define } from "./model.js";

export const readIndexCommand = define({
  name: "index",
  tool: "kb_index",
  usage: "index",
  description:
    "The index — title, type, status, description per record — rebuilt if stale. Cheapest re-orientation after compaction: call it (or kb_context) first, then kb_load or fetch by id.",
  input: z.object({ bundlePath }),
  jsonRefused: true,
  fromArgv: (_argv, path) => ({ bundlePath: path }),
  run: ({ store }, { bundlePath: path }) => store.readIndex(path),
});
