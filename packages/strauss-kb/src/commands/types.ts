import { z } from "zod";
import { RECORD_TYPES } from "../record-types.js";
import { define } from "./model.js";

export const typesCommand = define({
  name: "types",
  tool: "kb_types",
  usage: "types",
  description:
    "The twelve record types with their purpose, body sections, and starting status. Read this before writing rather than guessing headings — a section the type does not define is rejected.",
  input: z.object({}),
  fromArgv: () => ({}),
  run: () => Promise.resolve(RECORD_TYPES),
});
