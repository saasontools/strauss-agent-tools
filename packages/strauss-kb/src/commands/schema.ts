import { z } from "zod";
import { kbJsonSchemas } from "../json-schema.js";
import { define } from "./model.js";

export const schemaCommand = define({
  name: "schema",
  tool: "kb_schema",
  usage: "schema",
  description:
    "JSON Schema for frontmatter, write input, and log entries, generated from the enforcing code.",
  input: z.object({}),
  fromArgv: () => ({}),
  run: () => Promise.resolve(kbJsonSchemas()),
});
