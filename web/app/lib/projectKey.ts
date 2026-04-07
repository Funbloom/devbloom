/**
 * Derive a backend project_key from a human-readable name:
 * lowercase, non-alphanumeric runs → single underscore, trim edges.
 * Matches server rule: lowercase letters, digits, dashes, underscores.
 */
export function projectKeyFromDisplayName(displayName: string): string {
  const raw = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return raw || "project";
}
