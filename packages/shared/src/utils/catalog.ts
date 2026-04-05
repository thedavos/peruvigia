import { normalizeName, normalizeKey } from "./normalization.js";
import { compactText, normalizeWhitespace } from "./text.js";

export type OpenDataCatalogResource = {
  format: string | null;
  title: string | null;
  url: string | null;
};

export type OpenDataCatalogEntry = {
  id: string | null;
  modifiedAt: string | null;
  resources: OpenDataCatalogResource[];
  title: string;
};

export function normalizeCatalogTitle(value: string) {
  return normalizeName(value);
}

export function normalizeOpenDataCatalogEntries(payload: unknown): OpenDataCatalogEntry[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  if ("dataset" in payload && Array.isArray((payload as { dataset?: unknown[] }).dataset)) {
    return ((payload as { dataset: unknown[] }).dataset ?? [])
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }

        const distribution = Array.isArray((entry as { distribution?: unknown[] }).distribution)
          ? ((entry as { distribution: unknown[] }).distribution ?? [])
          : [];

        return {
          id: compactText(String((entry as { identifier?: unknown }).identifier ?? "")),
          modifiedAt: compactText(String((entry as { modified?: unknown }).modified ?? "")),
          resources: distribution
            .map((resource) => {
              if (!resource || typeof resource !== "object") {
                return null;
              }

              return {
                format: compactText(String((resource as { format?: unknown }).format ?? "")),
                title: compactText(String((resource as { title?: unknown }).title ?? "")),
                url: compactText(
                  String(
                    (resource as { accessURL?: unknown; downloadURL?: unknown }).downloadURL ??
                      (resource as { accessURL?: unknown }).accessURL ??
                      "",
                  ),
                ),
              } satisfies OpenDataCatalogResource;
            })
            .filter((resource): resource is OpenDataCatalogResource => resource != null),
          title: compactText(String((entry as { title?: unknown }).title ?? "")) ?? "untitled",
        } satisfies OpenDataCatalogEntry;
      })
      .filter((entry): entry is OpenDataCatalogEntry => entry != null);
  }

  const results = ((payload as { result?: { results?: unknown[] } }).result?.results ??
    []) as unknown[];
  if (!Array.isArray(results)) {
    return [];
  }

  return results
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const resources = Array.isArray((entry as { resources?: unknown[] }).resources)
        ? ((entry as { resources: unknown[] }).resources ?? [])
        : [];

      return {
        id:
          compactText(String((entry as { id?: unknown; name?: unknown }).id ?? "")) ??
          compactText(String((entry as { name?: unknown }).name ?? "")),
        modifiedAt: compactText(
          String((entry as { metadata_modified?: unknown }).metadata_modified ?? ""),
        ),
        resources: resources
          .map((resource) => {
            if (!resource || typeof resource !== "object") {
              return null;
            }

            return {
              format: compactText(String((resource as { format?: unknown }).format ?? "")),
              title: compactText(String((resource as { name?: unknown }).name ?? "")),
              url: compactText(String((resource as { url?: unknown }).url ?? "")),
            } satisfies OpenDataCatalogResource;
          })
          .filter((resource): resource is OpenDataCatalogResource => resource != null),
        title: compactText(String((entry as { title?: unknown }).title ?? "")) ?? "untitled",
      } satisfies OpenDataCatalogEntry;
    })
    .filter((entry): entry is OpenDataCatalogEntry => entry != null);
}

export function inferOpenDataDistributionFormat<T extends string>(
  resource: Pick<OpenDataCatalogResource, "format" | "url">,
  supportedFormats: readonly T[],
) {
  const normalizedFormat = normalizeKey(resource.format ?? "");
  if (supportedFormats.includes(normalizedFormat as T)) {
    return normalizedFormat as T;
  }

  const url = resource.url?.toLowerCase() ?? "";
  for (const format of supportedFormats) {
    if (url.endsWith(`.${format.toLowerCase()}`)) {
      return format;
    }
  }

  if ((supportedFormats as readonly string[]).includes("html") && url.endsWith(".htm")) {
    return "html" as T;
  }

  return null;
}

export function selectPreferredOpenDataResource<T extends string>(
  resources: OpenDataCatalogResource[],
  distributionPriority: readonly T[],
  title: string,
) {
  for (const format of distributionPriority) {
    const match = resources.find(
      (resource) =>
        inferOpenDataDistributionFormat(resource, distributionPriority) === format && resource.url,
    );

    if (match?.url) {
      return {
        format,
        sourceUrl: match.url,
      };
    }
  }

  const fallbackMatch = resources.find((resource) => resource.url);
  if (!fallbackMatch?.url) {
    return null;
  }

  const inferredFormat = inferOpenDataDistributionFormat(fallbackMatch, distributionPriority);
  if (!inferredFormat) {
    throw new Error(`Unsupported catalog resource format for ${title}.`);
  }

  return {
    format: inferredFormat,
    sourceUrl: fallbackMatch.url,
  };
}

export function parseJsonRecords(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload.filter(
      (row): row is Record<string, unknown> => !!row && typeof row === "object",
    );
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const candidates = [
    (payload as { records?: unknown }).records,
    (payload as { data?: unknown }).data,
    (payload as { result?: { records?: unknown } }).result?.records,
    (payload as { result?: unknown[] }).result,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(
        (row): row is Record<string, unknown> => !!row && typeof row === "object",
      );
    }
  }

  return [];
}

export function parseCsvRecords(text: string) {
  const rows: string[][] = [];
  let currentField = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? "";
    const nextCharacter = text[index + 1] ?? "";

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentField += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && character === ",") {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if (!inQuotes && (character === "\n" || character === "\r")) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      currentRow.push(currentField);
      currentField = "";

      if (currentRow.some((field) => field.length > 0)) {
        rows.push(currentRow);
      }

      currentRow = [];
      continue;
    }

    currentField += character;
  }

  currentRow.push(currentField);
  if (currentRow.some((field) => field.length > 0)) {
    rows.push(currentRow);
  }

  const [headerRow, ...dataRows] = rows;
  if (!headerRow) {
    return [];
  }

  const headers = headerRow.map((column) => normalizeWhitespace(column));
  return dataRows
    .map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, compactText(row[index] ?? "")])),
    )
    .filter((row) => Object.values(row).some((value) => value != null)) as Array<
    Record<string, unknown>
  >;
}
