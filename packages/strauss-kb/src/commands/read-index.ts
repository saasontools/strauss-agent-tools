import { z } from "zod";
import { bundlePath, define } from "./model.js";

export const readIndexCommand = define({
  name: "index",
  tool: "kb_index",
  usage: "index",
  description:
    "The index, rebuilt if it disagrees with the records. One call gives the whole shape of the base: title, type, status, and description per record. The cheap re-orientation call after compaction or deep in a long session — a few hundred tokens; call it (or kb_context, when bases are pinned) first, then kb_load or fetch by concept id.",
  input: z.object({ bundlePath }),
  fromArgv: (_argv, path) => ({ bundlePath: path }),
  run: ({ store }, { bundlePath: path }) => store.readIndex(path),
});
