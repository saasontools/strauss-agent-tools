import { z } from "zod";
import { kbJsonSchemas } from "../json-schema.js";
import { define } from "./model.js";

export const schemaCommand = define({
  name: "schema",
  tool: "kb_schema",
  usage: "schema",
  description:
    "JSON Schema for the frontmatter, the write input, and log entries — generated from the code that enforces them, so it cannot drift from what a write will accept.",
  input: z.object({}),
  fromArgv: () => ({}),
  run: () => Promise.resolve(kbJsonSchemas()),
});
