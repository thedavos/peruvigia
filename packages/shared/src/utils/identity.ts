export function normalizeDocumentNumber(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  return normalized.length > 0 ? normalized : null;
}
