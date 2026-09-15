import { describe, expect, test } from "vitest";
import {
  attributeNameIsSafe,
  filePathIsSafe,
  localRevShapeIsSafe,
  refShapeIsSafe,
} from "./shape.js";

describe("shape checks", () => {
  test.for([
    ["main", true, true],
    ["feature/x-1", true, true],
    ["HEAD~1", false, true],
    ["main^", false, true],
    ["-x", false, false],
    ["a..b", false, false],
    ["a b", false, false],
    ["@{-1}", false, false],
    ["", false, false],
    ["x".repeat(201), false, false],
  ] as const)("%s: ref %s, local rev %s", ([rev, ref, local]) => {
    expect(refShapeIsSafe(rev)).toBe(ref);
    expect(localRevShapeIsSafe(rev)).toBe(local);
  });

  test.for([
    ["src/a.ts", true],
    ["./src/a.ts", true],
    ["-p", false],
    ["src/../../etc", false],
    ["a\0b", false],
    ["", false],
  ] as const)("path %s is %s", ([path, safe]) => {
    expect(filePathIsSafe(path)).toBe(safe);
  });

  test.for([
    ["linguist-generated", true],
    ["strauss-class", true],
    ["--all", false],
    ["a b", false],
  ] as const)("attribute %s is %s", ([name, safe]) => {
    expect(attributeNameIsSafe(name)).toBe(safe);
  });
});
