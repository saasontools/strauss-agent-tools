import { z } from "zod";
import { bundlePath, conceptId, define } from "./model.js";

export const backlinksCommand = define({
  name: "backlinks",
  tool: "kb_backlinks",
  usage: "backlinks <concept-id>",
  description:
    'Who points at this record: every inbound typed causal link (`strauss_links`), one hop, every rel including `related_to`, each with the rel it was made with and the standing of the record that made it. The flat counterpart to kb_impact — this answers "what does the base currently say about this id", where kb_impact answers "what breaks if it changes" and takes positions to do it. Reach for this when reviewing or renaming a record and you need the exact edges rather than a causal closure. A backlink from a superseded record is not a live dependency, which is why every row carries its standing rather than arriving as a bare id. The outbound direction is on the record itself, in its own `strauss_links`.',
  input: z.object({ bundlePath, conceptId }),
  fromArgv: (argv, path) => ({ bundlePath: path, conceptId: argv[1] }),
  run: async ({ store }, { bundlePath: path, conceptId: id }) =>
    store.backlinks(path, id),
});
