import { compactText, normalizeWhitespace } from "./text.js";
import { normalizeKey } from "./normalization.js";

export type KeyedRow = Map<string, unknown>;

export function toKeyedRow(row: Record<string, unknown>) {
  return new Map<string, unknown>(
    Object.entries(row).map(([key, value]) => [normalizeKey(key), value]),
  );
}

export function readRowString(values: KeyedRow, aliases: string[], includes: string[] = []) {
  for (const alias of aliases) {
    const exactMatch = compactText(String(values.get(alias) ?? ""));
    if (exactMatch) {
      return exactMatch;
    }
  }

  for (const [key, value] of values.entries()) {
    if (!includes.some((hint) => key.includes(hint))) {
      continue;
    }

    const match = compactText(String(value ?? ""));
    if (match) {
      return match;
    }
  }

  return null;
}

export function readNameFromComponents(values: KeyedRow, contextHints: string[] = []) {
  const componentKeys = [...values.keys()].filter((key) => {
    const hasNameToken =
      key.includes("nombre") || key.includes("apellido") || key.includes("nombres");
    return hasNameToken && contextHints.every((hint) => key.includes(hint));
  });

  if (componentKeys.length === 0) {
    return null;
  }

  const assembled = componentKeys
    .sort((left, right) => left.localeCompare(right))
    .map((key) => compactText(String(values.get(key) ?? "")))
    .filter((value): value is string => value != null)
    .join(" ");

  return compactText(assembled);
}

export function parseIsoDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const compact = normalizeWhitespace(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(compact)) {
    return compact;
  }

  const compactNumericMatch = compact.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactNumericMatch) {
    const [, year, month, day] = compactNumericMatch;
    return `${year}-${month}-${day}`;
  }

  const slashMatch = compact.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${year}-${month?.padStart(2, "0")}-${day?.padStart(2, "0")}`;
  }

  const native = new Date(compact);
  if (!Number.isNaN(native.valueOf())) {
    return native.toISOString().slice(0, 10);
  }

  return null;
}
