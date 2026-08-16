import { z } from "zod";
import { composeInputSchema } from "./compose.js";
import { kbLogEntrySchema } from "./kb-log.js";
import { kbRecordFrontmatterSchema } from "./kb-record.schema.js";

/**
 * The frontmatter contract, emitted rather than restated.
 *
 * Prose describing a schema drifts from the code that enforces it; a generated
 * artifact cannot. Documentation points at this, a YAML language server
 * validates hand-edited records against it, and a consumer that is not
 * TypeScript has something to check.
 *
 * `io: 'input'` on purpose. `strauss_status` carries a default, so the output
 * type marks it required while the *document* may legitimately omit it — and
 * the document is what this schema is used to validate.
 */
export function kbJsonSchemas(): Record<string, unknown> {
  return {
    recordFrontmatter: z.toJSONSchema(kbRecordFrontmatterSchema, {
      io: "input",
    }),
    composeInput: z.toJSONSchema(composeInputSchema, { io: "input" }),
    logEntry: z.toJSONSchema(kbLogEntrySchema, { io: "input" }),
  };
}
