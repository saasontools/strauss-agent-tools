// @ts-check
/** The policy file: where it is read from, what parses, and what a floor does. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
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
