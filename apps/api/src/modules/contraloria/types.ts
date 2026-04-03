import type { ContraloriaSignalType } from "@peruvigia/shared";

export const CONTRALORIA_SOURCE_TYPE = "contraloria_sanciones";

export const CONTRALORIA_REPORTS_LIST_URL =
  "https://www.gob.pe/institucion/contraloria/informes-publicaciones/tipos/14-reporte";

export const CONTRALORIA_PUBLICATION_SLUG = "relacion-de-sanciones-inscritas-y-vigentes";

export type ContraloriaFamily = "ley_29622" | "ley_31288" | "diferidas" | "unknown";

export type RowStatusSource = "explicit" | "dates" | "family_context" | "unknown";

export type RowClassification = {
  signalType: ContraloriaSignalType;
  isActive: boolean;
  severity: number;
  statusReason: RowStatusSource;
};

export type SourceAttachment = {
  attachmentUrl: string;
  family: ContraloriaFamily;
  fileName: string;
  reportDate: string;
  reportUrl: string;
  workbookData: Buffer;
};

export type ParsedWorkbookRow = {
  attachmentUrl: string;
  entityName: string | null;
  family: ContraloriaFamily;
  fullName: string | null;
  rawPayload: Record<string, unknown>;
  regime: string;
  reportDate: string;
  reportUrl: string;
  resolutionDate: string | null;
  resolutionNumber: string | null;
  rowNumber: number;
  sanctionType: string | null;
  sheetName: string;
  sourceFileName: string;
  startDate: string | null;
  statusRaw: string | null;
  endDate: string | null;
  documentNumber: string | null;
};

export type NormalizedSanctionRecord = ParsedWorkbookRow & {
  canonicalKey: string;
  classification: RowClassification;
  fingerprintHash: string;
  normalizedDocumentNumber: string | null;
  normalizedEntityName: string | null;
  normalizedFullName: string;
  normalizedResolutionNumber: string | null;
  normalizedSanctionType: string;
};

export type SyncSummary = {
  downloaded: number;
  failed: number;
  inserted: number;
  processed: number;
  reused: number;
  skipped: number;
  updated: number;
};

export type PreparedSignal = {
  isActive: boolean;
  metadata: Record<string, unknown>;
  severity: number;
  signalType: ContraloriaSignalType;
  summary: string;
  title: string;
};

export type ContraloriaSyncResult = {
  errors: string[];
  summary: SyncSummary;
};

export type AcquireOptions = {
  allowBackfill?: boolean;
  inputDir?: string;
  reportUrl?: string;
};
