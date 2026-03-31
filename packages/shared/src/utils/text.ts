export function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function removeDiacritics(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}+/gu, "");
}

export function normalizeForComparison(value: string) {
  return normalizeWhitespace(removeDiacritics(value).toLowerCase());
}

export function compactText(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = normalizeWhitespace(String(value));
  return normalized.length > 0 ? normalized : null;
}
