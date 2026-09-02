import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";
import { themes as prismThemes } from "prism-react-renderer";

/**
 * The documentation site for @saasontools/strauss-kb.
 *
 * Docs-only: `routeBasePath: "/"` puts the docs at the site root and there is
 * no blog, because this site documents one package rather than publishing
 * announcements. `onBrokenLinks: "throw"` makes a dead cross-reference fail the
 * build rather than ship — the reference pages link heavily between each other.
 */
const config: Config = {
  title: "strauss-kb",
  tagline:
    "A knowledge base of markdown records with standing, supersession, and trace",
  favicon: "img/favicon.svg",

  // `future.v4` is deliberately off: it switches the build onto the Rspack
  // bundler, which requires the separate @docusaurus/faster package. The
  // default webpack build needs no extra dependency and produces the same site.

  // GitHub Pages for the saasontools/strauss-agent-tools repository.
  url: "https://saasontools.github.io",
  baseUrl: "/strauss-agent-tools/",
  organizationName: "saasontools",
  projectName: "strauss-agent-tools",
  trailingSlash: false,

  onBrokenLinks: "throw",
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "throw",
    },
  },

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
          editUrl:
            "https://github.com/saasontools/strauss-agent-tools/tree/main/apps/strauss-kb-docs/",
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "strauss-kb",
      items: [
        {
          type: "docSidebar",
          sidebarId: "docs",
          position: "left",
          label: "Docs",
        },
        {
          href: "https://www.npmjs.com/package/@saasontools/strauss-kb",
          label: "npm",
          position: "right",
        },
        {
          href: "https://github.com/saasontools/strauss-agent-tools",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            { label: "Overview", to: "/" },
            { label: "Specification", to: "/specification" },
            { label: "Architecture", to: "/architecture" },
          ],
        },
        {
          title: "Reference",
          items: [
            { label: "CLI", to: "/cli-reference" },
            { label: "MCP", to: "/mcp-reference" },
            { label: "Use cases", to: "/use-cases" },
          ],
        },
        {
          title: "More",
          items: [
            {
              label: "GitHub",
              href: "https://github.com/saasontools/strauss-agent-tools",
            },
            {
              label: "npm",
              href: "https://www.npmjs.com/package/@saasontools/strauss-kb",
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} SaaSOn Tools. MIT licensed.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["bash", "json", "yaml"],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
