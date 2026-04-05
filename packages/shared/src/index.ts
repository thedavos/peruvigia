import { z } from "zod";

export * from "./utils/date.js";
export * from "./utils/catalog.js";
export * from "./utils/identity.js";
export * from "./utils/normalization.js";
export * from "./utils/object.js";
export * from "./utils/rows.js";
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

export const DjiLinkTypeValues = [
  "employment",
  "commercial",
  "family",
  "guild",
  "board_membership",
] as const;

export const DjiLinkTypeSchema = z.enum(DjiLinkTypeValues);

export const DjiEvidenceSchema = z.object({
  sourceRecordId: z.string().uuid(),
  declarationExternalId: z.string().min(1),
  sourceUrl: z.string().url().nullable(),
  observedAt: z.iso.datetime(),
});

export const DjiEntityLinkSchema = z.object({
  linkId: z.string().uuid(),
  linkType: DjiLinkTypeSchema,
  detail: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  entity: z.object({
    entityId: z.string().uuid(),
    entityType: z.string().min(1),
    name: z.string().min(1),
    externalIdentifier: z.string().nullable(),
  }),
  evidence: DjiEvidenceSchema,
});

export const DjiPersonLinkSchema = z.object({
  linkId: z.string().uuid(),
  linkType: DjiLinkTypeSchema,
  detail: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  relatedPerson: z.object({
    personId: z.string().uuid(),
    fullName: z.string().min(1),
    documentNumber: z.string().nullable(),
  }),
  evidence: DjiEvidenceSchema,
});

export const DjiContextResponseSchema = z.object({
  personId: z.string().uuid(),
  entityLinks: z.array(DjiEntityLinkSchema),
  personLinks: z.array(DjiPersonLinkSchema),
});

export type ContraloriaSignalType = z.infer<typeof ContraloriaSignalTypeSchema>;
export type ContraloriaStatusSignal = z.infer<typeof ContraloriaStatusSignalSchema>;
export type ContraloriaStatusResponse = z.infer<typeof ContraloriaStatusResponseSchema>;
export type DjiLinkType = z.infer<typeof DjiLinkTypeSchema>;
export type DjiEvidence = z.infer<typeof DjiEvidenceSchema>;
export type DjiEntityLink = z.infer<typeof DjiEntityLinkSchema>;
export type DjiPersonLink = z.infer<typeof DjiPersonLinkSchema>;
export type DjiContextResponse = z.infer<typeof DjiContextResponseSchema>;
