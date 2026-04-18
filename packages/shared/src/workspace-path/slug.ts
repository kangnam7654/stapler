import { createHash } from "node:crypto";

export function toWorkspaceSlug(name: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (ascii.length > 0) return ascii;
  const hash = createHash("sha256").update(name).digest("hex").slice(0, 8);
  return `name-${hash}`;
}
