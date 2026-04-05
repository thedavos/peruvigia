import { z } from "zod";

export const AttentionScoreLevelValues = ["low", "medium", "high", "critical"] as const;

export const AttentionScoreLevelSchema = z.enum(AttentionScoreLevelValues);

export const AttentionReasonImpactValues = ["context", "low", "medium", "high"] as const;

export const AttentionReasonImpactSchema = z.enum(AttentionReasonImpactValues);

export const AttentionFactorKeyValues = [
  "contraloria_sanction_active",
  "contraloria_sanction_historical",
  "dji_declared_commercial_link_context",
  "dji_declared_family_link_context",
  "dji_declared_board_link_context",
  "dji_declared_employment_link_context",
  "dji_declared_guild_link_context",
  "supplier_relationship_context",
  "commercial_match_with_declared_entity",
  "supplier_match_with_declared_provider",
  "contracting_activity_with_related_supplier",
] as const;

export const AttentionFactorKeySchema = z.enum(AttentionFactorKeyValues);

export const AttentionEvidenceSchema = z.object({
  detail: z.string().min(1),
  observedAt: z.iso.datetime().nullable(),
  sourceExternalId: z.string().nullable(),
  sourceRecordId: z.string().uuid(),
  sourceType: z.string().min(1),
  sourceUrl: z.string().url().nullable(),
});

export const AttentionReasonSchema = z.object({
  impact: AttentionReasonImpactSchema,
  key: AttentionFactorKeySchema,
  label: z.string().min(1),
  summary: z.string().min(1),
  weight: z.number().nonnegative(),
});

export const AttentionFactorSchema = z.object({
  contribution: z.number().nonnegative(),
  evidence: z.array(AttentionEvidenceSchema),
  isPenalizable: z.boolean(),
  key: AttentionFactorKeySchema,
  metadata: z.record(z.string(), z.unknown()),
  weight: z.number().nonnegative(),
});

export const AttentionScoreSummarySchema = z.object({
  level: AttentionScoreLevelSchema,
  summary: z.string().min(1),
  value: z.number().nonnegative(),
});

export const AttentionProfileContextSchema = z.object({
  activeSanctionsCount: z.number().int().nonnegative(),
  aliases: z.array(z.string().min(1)),
  awardsCount: z.number().int().nonnegative(),
  entityLinksCount: z.number().int().nonnegative(),
  personLinksCount: z.number().int().nonnegative(),
  relatedSuppliersCount: z.number().int().nonnegative(),
});

export const AttentionProfileResponseSchema = z.object({
  calculationVersion: z.string().min(1),
  calculatedAt: z.iso.datetime(),
  context: AttentionProfileContextSchema,
  factors: z.array(AttentionFactorSchema),
  personId: z.string().uuid(),
  reasons: z.array(AttentionReasonSchema),
  score: AttentionScoreSummarySchema,
});

export type AttentionScoreLevel = z.infer<typeof AttentionScoreLevelSchema>;
export type AttentionReasonImpact = z.infer<typeof AttentionReasonImpactSchema>;
export type AttentionFactorKey = z.infer<typeof AttentionFactorKeySchema>;
export type AttentionEvidence = z.infer<typeof AttentionEvidenceSchema>;
export type AttentionReason = z.infer<typeof AttentionReasonSchema>;
export type AttentionFactor = z.infer<typeof AttentionFactorSchema>;
export type AttentionProfileContext = z.infer<typeof AttentionProfileContextSchema>;
export type AttentionProfileResponse = z.infer<typeof AttentionProfileResponseSchema>;
