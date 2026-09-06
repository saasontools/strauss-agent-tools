import type { Node } from "web-tree-sitter";

/**
 * Leaf text in source order, comments skipped whole.
 *
 * Iterative rather than recursive: a span is bounded by `MAX_ANCHOR_FILE_BYTES`
 * but its nesting depth is not, and a deeply nested literal must not be able to
 * overflow the stack on a read path.
 */
export function tokens(root: Node): string[] {
  const out: string[] = [];
  const stack: Node[] = [root];
  while (stack.length) {
    const node = stack.pop() as Node;
    if (node.type.includes("comment")) continue;
    if (node.childCount === 0) {
      const text = node.text.trim();
      if (text) out.push(text);
      continue;
    }
    for (let at = node.childCount - 1; at >= 0; at--) {
      const child = node.child(at);
      if (child) stack.push(child);
    }
  }
  return out;
}
