import type { AuthorType } from "../lib/types";

export function classifyAuthor(
  author: { login: string; __typename: string } | null,
): AuthorType {
  if (!author) return "human";
  if (author.__typename === "Bot") return "bot";
  if (author.login.endsWith("[bot]")) return "bot";
  return "human";
}
