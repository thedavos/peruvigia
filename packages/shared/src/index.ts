import { z } from "zod";

export * from "./utils/date.js";
export * from "./utils/identity.js";
export * from "./utils/normalization.js";
export * from "./utils/object.js";
export * from "./utils/text.js";

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("api"),
  timestamp: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ContraloriaSignalTypeValues = [
  "contraloria_sanction_active",
  "contraloria_sanction_historical",
  "contraloria_sanction_deferred",
  "contraloria_sanction_unknown_context",
] as const;

export const ContraloriaSignalTypeSchema = z.enum(ContraloriaSignalTypeValues);

export const ContraloriaStatusSignalSchema = z.object({
  signalId: z.string().uuid(),
  sourceRecordId: z.string().uuid(),
  signalType: ContraloriaSignalTypeSchema,
  isActive: z.boolean(),
  title: z.string().min(1),
  summary: z.string().min(1),
  sanctionType: z.string().min(1),
  entityName: z.string().nullable(),
  resolutionNumber: z.string().nullable(),
  resolutionDate: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  reportUrl: z.string().url(),
  attachmentUrl: z.string().url(),
  canonicalKey: z.string().min(1),
});

export const ContraloriaStatusResponseSchema = z.object({
  personId: z.string().uuid(),
  hasActiveSanction: z.boolean(),
  activeSignals: z.array(ContraloriaStatusSignalSchema),
  contextSignals: z.array(ContraloriaStatusSignalSchema),
});

export type ContraloriaSignalType = z.infer<typeof ContraloriaSignalTypeSchema>;
export type ContraloriaStatusSignal = z.infer<typeof ContraloriaStatusSignalSchema>;
export type ContraloriaStatusResponse = z.infer<typeof ContraloriaStatusResponseSchema>;
