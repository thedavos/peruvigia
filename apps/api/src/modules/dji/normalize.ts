import {
  compactText,
  normalizeDocumentNumber,
  normalizeKey,
  normalizeName,
  normalizeWhitespace,
  slugify,
} from "@peruvigia/shared";
import { hashNormalizedPayload } from "@peruvigia/shared/node";

import type {
  DjiDatasetKind,
  DjiDownloadedDataset,
  DjiNormalizedDeclaration,
  DjiNormalizedEntityLink,
  DjiNormalizedPersonLink,
} from "./types.js";

type KeyedRow = Map<string, unknown>;

type DjiNormalizationResult = {
  declarations: DjiNormalizedDeclaration[];
  errors: string[];
  skipped: number;
};

type DjiNonDeclarationDataset = DjiDownloadedDataset & {
  kind: Exclude<DjiDatasetKind, "declarations">;
};

type DjiEntityDataset = DjiDownloadedDataset & {
  kind: Exclude<DjiDatasetKind, "declarations" | "family">;
};

const DECLARATION_ID_ALIASES = [
  "codigoddjj",
  "codigo_ddjj",
  "iddeclaracion",
  "id_declaracion",
  "iddeclaracionjurada",
  "iddeclaracionjuradadeintereses",
  "declarationid",
];

const DECLARANT_DOCUMENT_ALIASES = [
  "dni",
  "nrodocumento",
  "numerodocumento",
  "numero_documento",
  "documento",
  "documentodeidentidad",
];

const DECLARANT_NAME_ALIASES = [
  "apellidosynombres",
  "nombresyapellidos",
  "nombrecompleto",
  "declarante",
  "servidor",
  "funcionario",
];

const CURRENT_POSITION_ALIASES = ["cargo", "cargoactual", "puesto", "funcion", "rol"];
const INSTITUTION_ALIASES = ["entidad", "institucion", "organizacion", "nombreentidad"];
const OBSERVED_AT_ALIASES = [
  "fechadeclaracion",
  "fechapresentacion",
  "fecharegistro",
  "fechadeenvio",
  "fechadedeclaracion",
];

const ENTITY_IDENTIFIER_ALIASES = [
  "identificadorentidad",
  "ruc",
  "numeroruc",
  "rucempresa",
  "codigoentidad",
];

const FAMILY_DETAIL_ALIASES = ["parentesco", "vinculo", "relacion"];

function toKeyedRow(row: Record<string, unknown>) {
  return new Map<string, unknown>(
    Object.entries(row).map(([key, value]) => [normalizeKey(key), value]),
  );
}

function readRowString(values: KeyedRow, aliases: string[], includes: string[] = []) {
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

function readNameFromComponents(values: KeyedRow, contextHints: string[] = []) {
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

function parseIsoDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const compact = normalizeWhitespace(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(compact)) {
    return compact;
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

function readRowDate(values: KeyedRow, aliases: string[], includes: string[] = []) {
  const candidate = readRowString(values, aliases, includes);
  return parseIsoDate(candidate);
}

function resolveDeclarationIdentity(values: KeyedRow) {
  const fullName =
    readRowString(values, DECLARANT_NAME_ALIASES, ["declarante", "nombres", "apellidos"]) ??
    readNameFromComponents(values) ??
    null;
  const normalizedName = fullName ? normalizeName(fullName) : null;
  const documentNumber = normalizeDocumentNumber(
    readRowString(values, DECLARANT_DOCUMENT_ALIASES, ["documento", "dni"]),
  );
  const officialDeclarationId = readRowString(values, DECLARATION_ID_ALIASES, [
    "declaracion",
    "declaracionjurada",
  ]);

  if (!officialDeclarationId && !documentNumber && !normalizedName) {
    return null;
  }

  const fallbackKey = hashNormalizedPayload({
    documentNumber,
    normalizedName,
  });
  const joinKey = officialDeclarationId ?? fallbackKey;

  return {
    declarationExternalId: officialDeclarationId ?? `dji:${fallbackKey}`,
    documentNumber,
    fullName,
    joinKey,
    normalizedName,
  };
}

function resolveObservedAt(values: KeyedRow, fallback: string | null) {
  return (
    readRowDate(values, OBSERVED_AT_ALIASES, ["fecha"]) ??
    parseIsoDate(fallback) ??
    new Date().toISOString().slice(0, 10)
  );
}

function resolveEntityName(
  values: KeyedRow,
  kind: Exclude<DjiDatasetKind, "declarations" | "family">,
) {
  const hintsByKind: Record<typeof kind, string[]> = {
    board_membership: ["organo", "colegiado"],
    commercial: ["empresa", "sociedad", "entidad", "razonsocial"],
    employment: ["entidad", "institucion", "empleador"],
    guild: ["gremio", "organizacion"],
  };

  return (
    readRowString(values, INSTITUTION_ALIASES, hintsByKind[kind]) ??
    readNameFromComponents(values, hintsByKind[kind]) ??
    null
  );
}

function resolveEntityType(kind: Exclude<DjiDatasetKind, "declarations" | "family">) {
  if (kind === "employment") {
    return "employment_entity";
  }

  if (kind === "commercial") {
    return "commercial_entity";
  }

  if (kind === "guild") {
    return "guild";
  }

  return "board";
}

function buildDetail(values: KeyedRow, aliases: string[], includes: string[]) {
  const detailParts = [
    ...aliases.map((alias) => readRowString(values, [alias])),
    ...includes.map((hint) => readRowString(values, [], [hint])),
  ].filter((value, index, list): value is string => value != null && list.indexOf(value) === index);

  return detailParts.length > 0 ? detailParts.join(" - ") : null;
}

function normalizeDeclarationRow(dataset: DjiDownloadedDataset, row: Record<string, unknown>) {
  const values = toKeyedRow(row);
  const identity = resolveDeclarationIdentity(values);
  if (!identity?.fullName || !identity.normalizedName) {
    return null;
  }

  return {
    currentPosition: readRowString(values, CURRENT_POSITION_ALIASES, ["cargo", "puesto"]),
    declarationExternalId: identity.declarationExternalId,
    documentNumber: identity.documentNumber,
    fullName: identity.fullName,
    institutionName: readRowString(values, INSTITUTION_ALIASES, ["entidad", "institucion"]),
    joinKey: identity.joinKey,
    normalizedName: identity.normalizedName,
    observedAt: resolveObservedAt(values, dataset.modifiedAt),
    rawDeclaration: row,
    sourceUrl: dataset.sourceUrl,
  };
}

function normalizeEntityLinkRow(
  kind: Exclude<DjiDatasetKind, "declarations" | "family">,
  row: Record<string, unknown>,
) {
  const values = toKeyedRow(row);
  const identity = resolveDeclarationIdentity(values);
  if (!identity?.joinKey) {
    return null;
  }

  const entityName = resolveEntityName(values, kind);
  if (!entityName) {
    return null;
  }

  const normalizedEntityName = normalizeName(entityName);
  const entityType = resolveEntityType(kind);
  const externalIdentifier =
    normalizeDocumentNumber(readRowString(values, ENTITY_IDENTIFIER_ALIASES, ["ruc", "codigo"])) ??
    `dji:${entityType}:${slugify(normalizedEntityName)}`;

  const detail = buildDetail(
    values,
    ["cargo", "rol", "participacion", "condicion", "detalle", "actividad", "representacion"],
    ["cargo", "rol", "participacion", "actividad"],
  );

  const linkTypeByKind = {
    board_membership: "board_membership",
    commercial: "commercial",
    employment: "employment",
    guild: "guild",
  } as const;

  return {
    joinKey: identity.joinKey,
    link: {
      detail,
      endDate: readRowDate(values, ["fechafin", "fechatermino", "hasta"], ["termino", "fin"]),
      entityName,
      entityType,
      externalIdentifier,
      linkType: linkTypeByKind[kind],
      metadata: {
        declarationJoinKey: identity.joinKey,
        detail,
        sourceCategory: kind,
      },
      normalizedEntityName,
      rawPayload: row,
      startDate: readRowDate(values, ["fechainicio", "desde"], ["inicio", "desde"]),
    } satisfies DjiNormalizedEntityLink,
  };
}

function isNonDeclarationDataset(
  dataset: DjiDownloadedDataset,
): dataset is DjiNonDeclarationDataset {
  return dataset.kind !== "declarations";
}

function isEntityDataset(dataset: DjiNonDeclarationDataset): dataset is DjiEntityDataset {
  return dataset.kind !== "family";
}

function normalizeFamilyLinkRow(row: Record<string, unknown>) {
  const values = toKeyedRow(row);
  const identity = resolveDeclarationIdentity(values);
  if (!identity?.joinKey) {
    return null;
  }

  const fullName =
    readRowString(
      values,
      ["nombrefamiliar", "familiar", "apellidosynombresfamiliar"],
      ["familiar", "pariente"],
    ) ??
    readNameFromComponents(values, ["familiar"]) ??
    readNameFromComponents(values, ["pariente"]) ??
    null;

  if (!fullName) {
    return null;
  }

  const normalizedName = normalizeName(fullName);
  const documentNumber = normalizeDocumentNumber(
    readRowString(values, ["dnifamiliar", "documentofamiliar"], ["familiar", "dni", "documento"]),
  );
  const detail = buildDetail(values, FAMILY_DETAIL_ALIASES, ["parentesco", "relacion"]);

  return {
    joinKey: identity.joinKey,
    link: {
      detail,
      documentNumber,
      endDate: readRowDate(values, ["fechafin", "fechatermino"], ["termino", "fin"]),
      fullName,
      linkType: "family",
      metadata: {
        declarationJoinKey: identity.joinKey,
        detail,
        sourceCategory: "family",
      },
      normalizedName,
      rawPayload: row,
      startDate: readRowDate(values, ["fechainicio", "desde"], ["inicio", "desde"]),
    } satisfies DjiNormalizedPersonLink,
  };
}

function dedupeEntityLinks(links: DjiNormalizedEntityLink[]) {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = hashNormalizedPayload({
      detail: link.detail,
      endDate: link.endDate,
      externalIdentifier: link.externalIdentifier,
      linkType: link.linkType,
      startDate: link.startDate,
    });

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function dedupePersonLinks(links: DjiNormalizedPersonLink[]) {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = hashNormalizedPayload({
      detail: link.detail,
      documentNumber: link.documentNumber,
      endDate: link.endDate,
      linkType: link.linkType,
      normalizedName: link.normalizedName,
      startDate: link.startDate,
    });

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function normalizeDjiDatasets(datasets: DjiDownloadedDataset[]): DjiNormalizationResult {
  const errors: string[] = [];
  const declarationDataset = datasets.find((dataset) => dataset.kind === "declarations");
  if (!declarationDataset) {
    throw new Error("Missing declarations dataset for DJI normalization.");
  }

  const declarationsByJoinKey = new Map<
    string,
    DjiNormalizedDeclaration & {
      rawLinksByKind: Partial<Record<DjiDatasetKind, Array<Record<string, unknown>>>>;
    }
  >();
  let skipped = 0;

  for (const row of declarationDataset.rows) {
    const declaration = normalizeDeclarationRow(declarationDataset, row);
    if (!declaration) {
      skipped += 1;
      continue;
    }

    declarationsByJoinKey.set(declaration.joinKey, {
      currentPosition: declaration.currentPosition,
      declarationExternalId: declaration.declarationExternalId,
      documentNumber: declaration.documentNumber,
      entityLinks: [],
      fullName: declaration.fullName,
      institutionName: declaration.institutionName,
      normalizedName: declaration.normalizedName,
      observedAt: declaration.observedAt,
      personLinks: [],
      rawDeclaration: declaration.rawDeclaration,
      rawLinksByKind: {},
      sourceUrl: declaration.sourceUrl,
    });
  }

  for (const dataset of datasets.filter(isNonDeclarationDataset)) {
    for (const row of dataset.rows) {
      if (isEntityDataset(dataset)) {
        const normalized = normalizeEntityLinkRow(dataset.kind, row);
        if (!normalized) {
          skipped += 1;
          continue;
        }

        const declaration = declarationsByJoinKey.get(normalized.joinKey);
        if (!declaration) {
          skipped += 1;
          errors.push(
            `Orphan ${dataset.kind} row without matching declaration: ${normalized.joinKey}`,
          );
          continue;
        }

        const rawRows = declaration.rawLinksByKind[dataset.kind] ?? [];
        rawRows.push(row);
        declaration.rawLinksByKind[dataset.kind] = rawRows;
        declaration.entityLinks.push(normalized.link);
        continue;
      }

      const normalized = normalizeFamilyLinkRow(row);
      if (!normalized) {
        skipped += 1;
        continue;
      }

      const declaration = declarationsByJoinKey.get(normalized.joinKey);
      if (!declaration) {
        skipped += 1;
        errors.push(`Orphan family row without matching declaration: ${normalized.joinKey}`);
        continue;
      }

      const rawRows = declaration.rawLinksByKind.family ?? [];
      rawRows.push(row);
      declaration.rawLinksByKind.family = rawRows;
      declaration.personLinks.push(normalized.link);
    }
  }

  const declarations = [...declarationsByJoinKey.values()]
    .map((declaration) => ({
      ...declaration,
      entityLinks: dedupeEntityLinks(declaration.entityLinks),
      personLinks: dedupePersonLinks(declaration.personLinks),
    }))
    .filter((declaration) => {
      if (declaration.entityLinks.length > 0 || declaration.personLinks.length > 0) {
        return true;
      }

      skipped += 1;
      return false;
    });

  return {
    declarations,
    errors,
    skipped,
  };
}

export { normalizeDeclarationRow, normalizeEntityLinkRow, normalizeFamilyLinkRow };
