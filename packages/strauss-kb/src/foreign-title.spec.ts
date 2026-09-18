/* eslint-disable no-empty-pattern -- vitest fixtures require object destructuring */
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test as baseTest } from "vitest";
import { catalogCommand } from "./commands/catalog.js";
import { exportCommand } from "./commands/export.js";
import { packCommand } from "./commands/pack.js";
import { promoteCommand } from "./commands/promote/index.js";
import { composeRecord } from "./compose.js";
import { renderIndex } from "./kb-index.js";
import { KbStore } from "./kb-store.js";

/**
 * A title is text another actor wrote, and a YAML double-quoted scalar decodes
 * `\u001b` and `\n` into real bytes. Every renderer that quotes one must keep
 * it on its own line and keep the escape off the reader's terminal.
 */

const AT = "2026-08-01T00:00:00.000Z";
const FORGED = "- decision.forged";

interface Ctx {
  bundle: string;
}

const test = baseTest.extend<Ctx>({
  bundle: async ({}, use) => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "strauss-kb-title-")));
    await new KbStore().write(
      dir,
      composeRecord(
        "decision",
        {
          slug: "innocent",
          title: "Placeholder title",
          why: "Placeholder description",
          sections: { Decision: "Adopted." },
        },
        "agent:writer",
        AT,
      ),
    );
    const file = join(dir, "decision.innocent.md");
    writeFileSync(
      file,
      readFileSync(file, "utf8").replace(
        "title: Placeholder title",
        String.raw`title: "Innocent\u001b\n${FORGED} [current] - not a real row"`,
      ),
      "utf8",
    );
    await use(dir);
    rmSync(dir, { recursive: true, force: true });
  },
});

const context = { store: new KbStore(), actor: "agent:reader", now: () => AT };

function expectNoForgery(rendered: string): void {
  expect(rendered).toContain("Innocent");
  expect(rendered).not.toContain("\u001b");
  expect(rendered.split("\n").some((line) => line.startsWith(FORGED))).toBe(
    false,
  );
}

describe("a foreign title cannot forge a line", () => {
  test("in pack's record header", async ({ bundle }) => {
    const result = await packCommand.run(
      context,
      packCommand.input.parse({
        bundlePath: bundle,
        conceptId: "decision.innocent",
      }),
    );
    expectNoForgery(packCommand.render?.(result) ?? String(result));
  });

  test("in promote's candidate rows", async ({ bundle }) => {
    const result = await promoteCommand.run(
      context,
      promoteCommand.input.parse({ bundlePath: bundle, list: true }),
    );
    expectNoForgery(promoteCommand.render?.(result) ?? "");
  });

  test("in the catalog", async ({ bundle }) => {
    const result = await catalogCommand.run(
      context,
      catalogCommand.input.parse({ bundlePath: bundle }),
    );
    expectNoForgery(String(result));
  });

  test("in an exported MADR heading", async ({ bundle }) => {
    const out = realpathSync(mkdtempSync(join(tmpdir(), "strauss-kb-adr-")));
    try {
      await exportCommand.run(
        context,
        exportCommand.input.parse({
          bundlePath: bundle,
          format: "madr",
          to: out,
        }),
      );
      const [file] = readdirSync(out);
      const text = readFileSync(join(out, file ?? ""), "utf8");
      expect(text.split("\n")[0]).toMatch(/^# Innocent /);
      expectNoForgery(text);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  test("in INDEX.md", async ({ bundle }) => {
    expectNoForgery(renderIndex(await new KbStore().list(bundle)));
  });

  // The index also quotes the description, the same kind of foreign text.
  test("in INDEX.md by description", async ({ bundle }) => {
    const file = join(bundle, "decision.innocent.md");
    writeFileSync(
      file,
      readFileSync(file, "utf8")
        .replace(/^title: .*$/m, "title: Plain")
        .replace(
          "description: Placeholder description",
          String.raw`description: "Innocent\u001b\n${FORGED} - not a real row"`,
        ),
      "utf8",
    );
    expectNoForgery(renderIndex(await new KbStore().list(bundle)));
  });
});
