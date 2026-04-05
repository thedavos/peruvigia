import { normalizeForComparison } from "./text";

export function normalizeName(value: string) {
  return normalizeForComparison(value)
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeKey(value: string) {
  return normalizeForComparison(value)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function slugify(value: string) {
  return normalizeKey(value).replace(/_+/g, "-");
}
