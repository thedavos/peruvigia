import type { ContraloriaFamily, RowClassification } from "./types";
import { normalizeForComparison } from "@peruvigia/shared";

type ClassifyInput = {
  endDate: string | null;
  family: ContraloriaFamily;
  reportDate: string;
  startDate: string | null;
  statusRaw: string | null;
};

const ACTIVE_KEYWORDS = ["vigente", "activo", "activa", "en curso"];
const HISTORICAL_KEYWORDS = [
  "no vigente",
  "vencida",
  "vencido",
  "caduca",
  "caducado",
  "historica",
  "historico",
  "concluida",
  "concluido",
  "finalizada",
  "finalizado",
  "cumplida",
  "cumplido",
  "extinguida",
  "extinguido",
];
const DEFERRED_KEYWORDS = ["diferida", "diferido", "aplazada", "aplazado", "suspendida"];

function compareDateOnly(left: string, right: string) {
  return left.localeCompare(right);
}

function classifyFromExplicitStatus(statusRaw: string | null): RowClassification | null {
  if (!statusRaw) {
    return null;
  }

  const normalizedStatus = normalizeForComparison(statusRaw);

  if (HISTORICAL_KEYWORDS.some((keyword) => normalizedStatus.includes(keyword))) {
    return {
      isActive: false,
      severity: 35,
      signalType: "contraloria_sanction_historical",
      statusReason: "explicit",
    };
  }

  if (DEFERRED_KEYWORDS.some((keyword) => normalizedStatus.includes(keyword))) {
    return {
      isActive: false,
      severity: 25,
      signalType: "contraloria_sanction_deferred",
      statusReason: "explicit",
    };
  }

  if (ACTIVE_KEYWORDS.some((keyword) => normalizedStatus.includes(keyword))) {
    return {
      isActive: true,
      severity: 90,
      signalType: "contraloria_sanction_active",
      statusReason: "explicit",
    };
  }

  return null;
}

function classifyFromDates({
  reportDate,
  startDate,
  endDate,
}: Pick<ClassifyInput, "endDate" | "reportDate" | "startDate">): RowClassification | null {
  if (!startDate && !endDate) {
    return null;
  }

  if (startDate && compareDateOnly(reportDate, startDate) < 0) {
    return {
      isActive: false,
      severity: 25,
      signalType: "contraloria_sanction_deferred",
      statusReason: "dates",
    };
  }

  if (endDate && compareDateOnly(reportDate, endDate) > 0) {
    return {
      isActive: false,
      severity: 35,
      signalType: "contraloria_sanction_historical",
      statusReason: "dates",
    };
  }

  if ((startDate && compareDateOnly(reportDate, startDate) >= 0) || !startDate) {
    if (!endDate || compareDateOnly(reportDate, endDate) <= 0) {
      return {
        isActive: true,
        severity: 90,
        signalType: "contraloria_sanction_active",
        statusReason: "dates",
      };
    }
  }

  return null;
}

function classifyFromFamilyContext(family: ContraloriaFamily): RowClassification | null {
  if (family === "diferidas") {
    return {
      isActive: false,
      severity: 25,
      signalType: "contraloria_sanction_deferred",
      statusReason: "family_context",
    };
  }

  return null;
}

export function classifySanction(input: ClassifyInput): RowClassification {
  return (
    classifyFromExplicitStatus(input.statusRaw) ??
    classifyFromDates(input) ??
    classifyFromFamilyContext(input.family) ?? {
      isActive: false,
      severity: 20,
      signalType: "contraloria_sanction_unknown_context",
      statusReason: "unknown",
    }
  );
}
