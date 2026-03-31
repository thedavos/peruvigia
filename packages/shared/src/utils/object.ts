import { createHash } from "node:crypto";

export function readRecordString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => `"${key}":${stableStringify(nestedValue)}`);

    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value);
}

export function hashNormalizedPayload(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}
