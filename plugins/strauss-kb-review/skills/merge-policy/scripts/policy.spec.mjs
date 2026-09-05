// @ts-check
/** The policy file: where it is read from, what parses, and what a floor does. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  codeownersCover,
  effectiveMateriality,
  globToRegExp,
  matchesAny,
  readPolicy,
  POLICY_PATHS,
} from "./lib/policy.mjs";

/** @param {Record<string, string>} tree keyed `<rev>:<path>` */
function show(tree) {
  return (/** @type {string[]} */ args) => tree[args[0] ?? ""] ?? null;
}

/** One JSON policy at `main`, with the layering options a test needs.
 * @param {unknown} body
 * @param {{ defaults?: unknown, changed?: string[] }} [options] */
function read(body, options = {}) {
  return readPolicy(
    show({ "main:.strauss/merge-policy.json": JSON.stringify(body) }),
    "main",
    POLICY_PATHS,
    {
      defaults:
        options.defaults === undefined
          ? null
          : {
              path: "/org/defaults.json",
              text: JSON.stringify(options.defaults),
            },
      changed: options.changed ?? [],
    },
  );
}

test("reads the policy at the base rev, never the head", () => {
  const policy = readPolicy(
    show({
      "main:.strauss/merge-policy.json": JSON.stringify({
        version: 3,
        owners: ["dana"],
      }),
      "topic:.strauss/merge-policy.json": JSON.stringify({
        version: 4,
        owners: ["dana", "the-author"],
      }),
    }),
    "main",
    POLICY_PATHS,
  );
  assert.equal(policy.version, 3);
  assert.deepEqual(policy.data.owners, ["dana"]);
});

test("a missing file is absent, not empty", () => {
  const policy = readPolicy(show({}), "main", POLICY_PATHS);
  assert.equal(policy.present, false);
  assert.equal(policy.path, null);
  assert.equal(policy.hash, null);
});

test("JSON wins over YAML at the same rev", () => {
  const policy = readPolicy(
    show({
      "main:.strauss/merge-policy.json": '{"version":"json"}',
      "main:.strauss/merge-policy.yaml": "version: yaml\n",
    }),
    "main",
    POLICY_PATHS,
  );
  assert.equal(policy.format, "json");
  assert.equal(policy.version, "json");
});

test("a YAML policy parses everything but its floors", () => {
  const policy = readPolicy(
    show({
      "main:.strauss/merge-policy.yaml": [
        "version: 1",
        "",
        "review:",
        "  exclude:",
        '    - "packages/legacy/**"',
        "",
        "materialityFloors:",
        '  "review:security": important',
      ].join("\n"),
    }),
    "main",
    POLICY_PATHS,
  );
  assert.deepEqual(policy.data.exclude, ["packages/legacy/**"]);
  assert.deepEqual(policy.errors, []);
  // The subset parser cannot read a quoted key holding a colon, so the floors
  // fall back to the defaults and the run says so.
  assert.match(policy.notChecked.join(" "), /merge-policy\.json/);
  assert.equal(policy.data.floors["review:security"], "important");
});

test("a JSON policy's floors are read, and raise a materiality", () => {
  const policy = readPolicy(
    show({
      "main:.strauss/merge-policy.json": JSON.stringify({
        floors: { "review:ops": "blocking" },
      }),
    }),
    "main",
    POLICY_PATHS,
  );
  assert.equal(policy.data.floors["review:ops"], "blocking");
  assert.equal(
    effectiveMateriality("non-blocking", ["review:ops"], policy.data.floors),
    "blocking",
  );
});

test("an author value never lowers a floor, and a floor never lowers an author", () => {
  const floors = { "review:data": "important" };
  assert.equal(
    effectiveMateriality("non-blocking", ["review:data"], floors),
    "important",
  );
  assert.equal(
    effectiveMateriality("blocking", ["review:data"], floors),
    "blocking",
  );
  assert.equal(effectiveMateriality(undefined, [], floors), "non-blocking");
});

test("an unparseable policy is an error, not a permissive default", () => {
  const policy = readPolicy(
    show({ "main:.strauss/merge-policy.json": "{ not json" }),
    "main",
    POLICY_PATHS,
  );
  assert.equal(policy.present, true);
  assert.equal(policy.errors.length, 1);
});

test("a policy that parses to nothing is an error, not the defaults", () => {
  const garbled = readPolicy(
    show({ "main:.strauss/merge-policy.yaml": ">>> not a policy <<<\n" }),
    "main",
    POLICY_PATHS,
  );
  assert.equal(garbled.present, true);
  assert.equal(garbled.errors.length, 1);
  assert.match(garbled.errors[0] ?? "", /names none of/);

  // One recognised key is enough for the rest of the file to be read.
  const thin = readPolicy(
    show({ "main:.strauss/merge-policy.yaml": "enabled: dry-run\n" }),
    "main",
    POLICY_PATHS,
  );
  assert.deepEqual(thin.errors, []);
  assert.equal(thin.data.enabled, "dry-run");
});

test("enabled takes true, false and dry-run, and nothing else", () => {
  for (const [value, expected] of [
    [true, "true"],
    ["dry-run", "dry-run"],
    [false, "false"],
  ]) {
    const policy = readPolicy(
      show({
        "main:.strauss/merge-policy.json": JSON.stringify({ enabled: value }),
      }),
      "main",
      POLICY_PATHS,
    );
    assert.equal(policy.data.enabled, expected);
    assert.deepEqual(policy.errors, []);
  }
  const bad = readPolicy(
    show({ "main:.strauss/merge-policy.json": '{"enabled":"maybe"}' }),
    "main",
    POLICY_PATHS,
  );
  assert.equal(bad.errors.length, 1);
});

test("a glob covers its own subtree and stops at a segment", () => {
  assert.ok(globToRegExp("src/**").test("src/a/b.ts"));
  assert.ok(!globToRegExp("src/*").test("src/a/b.ts"));
  assert.ok(globToRegExp("**/*.md").test("docs/a/b.md"));
  assert.ok(matchesAny("packages/legacy/src/x.ts", ["packages/legacy/**"]));
  assert.ok(!matchesAny("packages/other/src/x.ts", ["packages/legacy/**"]));
});

test("auto is an allowlist: unnamed is nothing, and an empty block is nothing", () => {
  assert.deepEqual(read({ version: 1 }).data.autoClasses, []);
  assert.deepEqual(read({ version: 1, auto: {} }).data.autoClasses, []);
  assert.deepEqual(read({ auto: { classes: [] } }).data.autoClasses, []);
  const named = read({ auto: { classes: ["docs"], paths: ["**/*.lock"] } });
  assert.deepEqual(named.data.autoClasses, ["docs"]);
  assert.deepEqual(named.data.autoPaths, ["**/*.lock"]);
});

test("every value is checked against its closed set", () => {
  for (const [body, pattern] of /** @type {[any, RegExp][]} */ ([
    [{ types: { "open-question": "maybe" } }, /types\.open-question/],
    [{ tags: { "review:security": "block" } }, /tags\.review:security/],
    [{ floors: { "review:data": "urgent" } }, /floors\.review:data/],
    [{ auto: { classes: ["source"] } }, /auto\.classes: source/],
    [{ review: { crossing: "auto" } }, /review\.crossing/],
    [{ enabled: "maybe" }, /enabled/],
    [{ types: ["open-question"] }, /types must be a map/],
  ])) {
    const policy = read(body);
    assert.equal(policy.errors.length, 1, JSON.stringify(body));
    assert.match(policy.errors[0] ?? "", pattern);
  }
});

test("a key outside the closed set is an error, named with its layer", () => {
  const top = read({ version: 1, autoClasses: ["docs"] });
  assert.match(top.errors[0] ?? "", /^repo\.autoClasses is not one of/);

  const org = read({ version: 1 }, { defaults: { verifier: ["a"] } });
  assert.match(org.errors[0] ?? "", /^defaults\.verifier is not one of/);

  const over = read(
    { overrides: [{ paths: ["docs/**"], review: { exclude: ["docs/**"] } }] },
    { changed: ["docs/README.md"] },
  );
  assert.match(over.errors[0] ?? "", /^override\[0\]\.review is not one of/);
});

test("a non-string in a list is an error, not a dropped row", () => {
  assert.match(
    read({ auto: { classes: ["docs", 7] } }).errors[0] ?? "",
    /repo\.auto\.classes: 7 is not a string/,
  );
  assert.match(
    read({ review: { exclude: ["docs/**", null] } }).errors[0] ?? "",
    /repo\.review\.exclude: null is not a string/,
  );
  assert.match(
    read({ owners: [{ login: "dana" }] }).errors[0] ?? "",
    /repo\.owners: .* is not a string/,
  );
});

test("a glob leaving the repo root is an error; ./ and a repeated ** are not", () => {
  assert.match(
    read({ review: { include: ["../other/**"] } }).errors[0] ?? "",
    /repo\.review\.include: \.\.\/other\/\*\* leaves the repo root/,
  );
  assert.ok(matchesAny("src/a/b.ts", ["./src/**"]));
  assert.ok(matchesAny("src/a/b.ts", ["**/**/b.ts"]));
});

test("the SAA-741 human.types and human.tags shape still reads, as human", () => {
  const policy = read({
    human: { types: ["open-question"], tags: ["review:security"] },
  });
  assert.deepEqual(policy.errors, []);
  assert.equal(policy.data.types["open-question"], "human");
  assert.equal(policy.data.tags["review:security"], "human");
});

test("layering — the deepest layer that names a plain key wins", () => {
  const policy = read(
    { owners: ["dana"] },
    { defaults: { owners: ["org-lead"], verifiers: ["a"] } },
  );
  assert.deepEqual(policy.layers, ["defaults", "repo"]);
  assert.deepEqual(policy.data.owners, ["dana"]);
  // The repo named no verifiers, so the defaults' list stands.
  assert.deepEqual(policy.data.verifiers, ["a"]);
});

test("layering — enabled rises on dry-run, true, false", () => {
  const alone = read({ enabled: "dry-run" });
  assert.equal(alone.data.enabled, "dry-run");

  // A repo file may not talk an org layer down, in either direction.
  const up = read({ enabled: "dry-run" }, { defaults: { enabled: true } });
  assert.equal(up.data.enabled, "true");
  const off = read({ enabled: true }, { defaults: { enabled: false } });
  assert.equal(off.data.enabled, "false");

  const raised = read({ enabled: false }, { defaults: { enabled: "dry-run" } });
  assert.equal(raised.data.enabled, "false");
});

test("layering — verifiers narrow to the intersection, never widen", () => {
  const policy = read(
    { verifiers: ["a", "c"] },
    { defaults: { verifiers: ["a", "b"] } },
  );
  assert.deepEqual(policy.data.verifiers, ["a"]);
});

test("layering — an org layer naming no verifiers leaves the repo free to name some", () => {
  // Naming a list where the layer above named none only narrows, so it stands.
  const policy = read(
    { verifiers: ["human:sec"] },
    { defaults: { owners: ["org-lead"] } },
  );
  assert.deepEqual(policy.errors, []);
  assert.deepEqual(policy.data.verifiers, ["human:sec"]);
});

test("layering — review.exclude unions, and crossing rises to human", () => {
  const policy = read(
    { review: { exclude: ["src/**"], crossing: "off" } },
    { defaults: { review: { exclude: ["legacy/**"], crossing: "human" } } },
  );
  assert.deepEqual(policy.data.exclude, ["legacy/**", "src/**"]);
  assert.equal(policy.data.crossing, "human");

  const off = read({ review: { crossing: "off" } });
  assert.equal(off.data.crossing, "off");
});

test("layering — a deeper layer escalates a disposition and never lowers one", () => {
  const up = read(
    { types: { decision: "human" } },
    { defaults: { types: { decision: "auto", fact: "auto" } } },
  );
  assert.equal(up.data.types.decision, "human");
  assert.equal(up.data.types.fact, "auto");

  const down = read(
    { types: { decision: "auto" }, tags: { "review:security": "off" } },
    {
      defaults: {
        types: { decision: "human" },
        tags: { "review:security": "human" },
      },
    },
  );
  assert.equal(down.data.types.decision, "human");
  assert.equal(down.data.tags["review:security"], "human");
});

test("layering — the auto allowlist narrows to the intersection", () => {
  const policy = read(
    { auto: { classes: ["docs", "test", "ci"] } },
    { defaults: { auto: { classes: ["docs", "test"] } } },
  );
  assert.deepEqual(policy.data.autoClasses, ["docs", "test"]);
});

test("layering — a floor only ever rises, over a layer or over the built-ins", () => {
  const raised = read(
    { floors: { "review:data": "blocking" } },
    { defaults: { floors: { "review:data": "important" } } },
  );
  assert.equal(raised.data.floors["review:data"], "blocking");

  const lowered = read(
    { floors: { "review:data": "non-blocking", "review:ops": "important" } },
    { defaults: { floors: { "review:data": "blocking" } } },
  );
  assert.equal(lowered.data.floors["review:data"], "blocking");
  // A built-in default is a floor of floors too.
  assert.equal(lowered.data.floors["review:security"], "important");
  assert.equal(lowered.data.floors["review:ops"], "important");
});

test("overrides — only the entries this range touched apply, and only toward human", () => {
  const body = {
    types: { decision: "auto" },
    floors: { "review:ops": "non-blocking" },
    auto: { classes: ["docs", "test"] },
    overrides: [
      {
        paths: ["packages/billing/**"],
        types: { decision: "human" },
        floors: { "review:ops": "blocking" },
        auto: { classes: ["docs"] },
      },
      { paths: ["packages/marketing/**"], types: { decision: "off" } },
    ],
  };

  const untouched = read(body, { changed: ["src/a.ts"] });
  assert.deepEqual(untouched.layers, ["repo"]);
  assert.equal(untouched.data.types.decision, "auto");
  assert.deepEqual(untouched.data.autoClasses, ["docs", "test"]);

  const touched = read(body, { changed: ["packages/billing/invoice.ts"] });
  assert.deepEqual(touched.layers, ["repo", "override:0"]);
  assert.equal(touched.data.types.decision, "human");
  assert.equal(touched.data.floors["review:ops"], "blocking");
  assert.deepEqual(touched.data.autoClasses, ["docs"]);
});

test("overrides — an override never turns a repo human into auto, nor lowers a floor", () => {
  const policy = read(
    {
      types: { decision: "human" },
      tags: { "review:security": "human" },
      floors: { "review:security": "blocking" },
      auto: { classes: ["docs"] },
      overrides: [
        {
          paths: ["docs/**"],
          types: { decision: "auto" },
          tags: { "review:security": "auto" },
          floors: { "review:security": "non-blocking" },
          auto: { classes: ["docs", "test", "ci"] },
        },
      ],
    },
    { changed: ["docs/README.md"] },
  );
  assert.equal(policy.data.types.decision, "human");
  assert.equal(policy.data.tags["review:security"], "human");
  assert.equal(policy.data.floors["review:security"], "blocking");
  // Widening the allowlist is a lowering too: the intersection holds.
  assert.deepEqual(policy.data.autoClasses, ["docs"]);
});

test("overrides — an override cannot introduce an auto allowlist from silence", () => {
  const policy = read(
    {
      version: 1,
      overrides: [{ paths: ["docs/**"], auto: { classes: ["docs"] } }],
    },
    { changed: ["docs/README.md"] },
  );
  assert.deepEqual(policy.layers, ["repo", "override:0"]);
  assert.deepEqual(policy.data.autoClasses, []);
});

test("overrides — a malformed entry is an error, not a skipped one", () => {
  assert.match(
    read({ overrides: [{ types: { fact: "human" } }] }).errors[0] ?? "",
    /override\[0\]\.paths/,
  );
  assert.match(
    read({ overrides: {} }).errors[0] ?? "",
    /repo\.overrides must be/,
  );
});

test("the hash covers the merged policy, and the layers are named", () => {
  const bare = read({ auto: { classes: ["docs"] } });
  const same = read(
    { auto: { classes: ["docs", "test"] } },
    { defaults: { auto: { classes: ["docs"] } } },
  );
  // Different files, the same effective rules — but not the same layers.
  assert.equal(bare.hash, same.hash);
  assert.deepEqual(bare.layers, ["repo"]);
  assert.deepEqual(same.layers, ["defaults", "repo"]);

  const other = read({ auto: { classes: ["test"] } });
  assert.notEqual(bare.hash, other.hash);
});

test("org defaults that cannot be read are an error, not an absence", () => {
  const policy = readPolicy(
    show({ "main:.strauss/merge-policy.json": '{"version":1}' }),
    "main",
    POLICY_PATHS,
    { defaults: { path: "/org/defaults.json", text: null } },
  );
  assert.match(policy.errors[0] ?? "", /org defaults .* is not readable/);
  assert.deepEqual(policy.layers, ["repo"]);
});

test("CODEOWNERS patterns are gitignore shaped", () => {
  const path = ".strauss/merge-policy.json";
  assert.ok(codeownersCover("* @acme/all\n", path));
  assert.ok(codeownersCover("/.strauss/ @acme/platform\n", path));
  assert.ok(codeownersCover("merge-policy.json @acme/platform\n", path));
  assert.ok(!codeownersCover("/src/ @acme/eng\n", path));
  // A comment, and a pattern with no owner, name nobody.
  assert.ok(!codeownersCover("# .strauss/ @acme/platform\n", path));
  assert.ok(!codeownersCover("/.strauss/\n", path));
});
