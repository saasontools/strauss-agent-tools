import { z } from "zod";
import { listPins } from "../kb-pins/index.js";
import { define } from "./model.js";

export const pinsCommand = define({
  name: "pins",
  tool: "kb_pins",
  usage: "pins",
  description:
    "Every pinned base across the manifest layers, with its layer and whether it resolves to records. Takes no bundlePath.",
  input: z.object({}),
  fromArgv: () => ({}),
  run: ({ store }) => listPins(store, process.cwd()),
});
