import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

/**
 * One hand-written sidebar, in reading order: what the package is, what the
 * format guarantees, how it is built, what you do with it, then the two
 * reference pages.
 */
const sidebars: SidebarsConfig = {
  docs: [
    "overview",
    "specification",
    "architecture",
    "use-cases",
    "cli-reference",
    "mcp-reference",
  ],
};

export default sidebars;
