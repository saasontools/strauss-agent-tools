import { z } from "zod";
import { listPins } from "../kb-pins/index.js";
import { define } from "./model.js";

export const pinsCommand = define({
  name: "pins",
  tool: "kb_pins",
  usage: "pins",
  description:
    "Every pinned base across the manifest layers, each with its layer and whether it currently resolves to readable records. Reads the workspace manifests rather than any one base, like kb_context.",
  input: z.object({}),
  fromArgv: () => ({}),
  run: ({ store }) => listPins(store, process.cwd()),
});
