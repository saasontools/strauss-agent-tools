import matter from "gray-matter";
import type { z } from "zod";

/**
 * Frontmatter round-tripping, thin over gray-matter.
 *
 * Thin on purpose. A record is a YAML block and a markdown body, and every
 * hand-rolled reader of that shape eventually meets a nested map — an OKF
 * `generated`, a `sources[]`, a `verified[]` — and misreads it. The parser is
 * therefore borrowed and the only thing added is the schema gate below.
 */
export function stringifyMarkdownWithFrontmatter(
  content: string,
  frontmatter: Record<string, unknown>,
): string {
  return matter.stringify(content, frontmatter);
}

export function splitMarkdownFrontmatter(text: string): {
  content: string;
  prefix: string;
  raw: Record<string, unknown>;
} {
  const file = matter(text);

  return {
    content: file.content,
    // Everything gray-matter consumed: the fences, the YAML, and the blank line
    // after them. Kept so a caller can rewrite a body without touching the head.
    prefix: text.slice(0, text.length - file.content.length),
    raw: file.data as Record<string, unknown>,
  };
}

/**
 * Splits, then validates the frontmatter against a schema.
 *
 * The result is a `safeParse` outcome rather than a throw: one malformed record
 * must not make a whole directory unreadable, so the caller decides whether to
 * skip it or fail.
 */
export function parseMarkdownWithFrontmatter<S extends z.ZodType>(
  text: string,
  schema: S,
): {
  content: string;
  prefix: string;
  raw: Record<string, unknown>;
  frontmatter: ReturnType<S["safeParse"]>;
} {
  const { content, prefix, raw } = splitMarkdownFrontmatter(text);

  return {
    content,
    prefix,
    raw,
    frontmatter: schema.safeParse(raw) as ReturnType<S["safeParse"]>,
  };
}
