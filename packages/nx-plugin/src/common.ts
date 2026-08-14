import type { Tree } from "@nx/devkit";

export const NPM_SCOPE = "@saasontools";
export const GITHUB_OWNER = "saasontools";
export const REPO_NAME = "strauss-agent-tools";
export const REPO_URL = `https://github.com/${GITHUB_OWNER}/${REPO_NAME}`;
export const COPYRIGHT_HOLDER = "Assaf Kamil";

// Nx compresses minor->patch for 0.x versions, so every publishable package
// starts at 1.0.0. See CONTRIBUTING.md ("Versioning").
export const INITIAL_VERSION = "1.0.0";

const MIT_LICENSE = `MIT License

Copyright (c) 2026 ${COPYRIGHT_HOLDER}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

/** Reuse the repo root LICENSE so every package ships the same text. */
export function licenseText(tree: Tree): string {
  const root = tree.read("LICENSE", "utf-8");
  return root ?? MIT_LICENSE;
}
