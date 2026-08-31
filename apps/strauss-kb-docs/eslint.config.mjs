import rootConfig from "../../eslint.config.js";

/**
 * Lint scope is the site's own TypeScript and JavaScript — the Docusaurus
 * config, the sidebar, and any React added later. Documentation content is
 * markdown, which the build itself checks (a broken link throws), so no
 * MDX-aware plugin is pulled in for it.
 */
export default [
  ...rootConfig,
  {
    ignores: ["build/", ".docusaurus/"],
  },
];
