import {
  AttentionProfileResponseSchema,
  type AttentionProfileResponse,
  type AttentionReasonImpact,
  type AttentionScoreLevel,
} from "@peruvigia/shared";

import type {
  AttentionComputedProfile,
  AttentionScoreInput,
  DerivedAttentionSignal,
} from "./types.ts";

export const ATTENTION_SCORE_VERSION = "attention_v1";

function compareSignals(left: DerivedAttentionSignal, right: DerivedAttentionSignal) {
  return (
    right.contribution - left.contribution ||
    right.weight - left.weight ||
    left.label.localeCompare(right.label)
  );
}

function toReasonImpact(signal: DerivedAttentionSignal): AttentionReasonImpact {
  if (!signal.isPenalizable || signal.contribution === 0) {
    return "context";
  }

  if (signal.contribution >= 50) {
    return "high";
  }

  if (signal.contribution >= 15) {
    return "medium";
  }

  return "low";
}

function toScoreLevel(scoreValue: number): AttentionScoreLevel {
  if (scoreValue >= 80) {
    return "critical";
  }

  if (scoreValue >= 50) {
    return "high";
  }

  if (scoreValue >= 20) {
    return "medium";
  }

  return "low";
}

function buildScoreSummary(
  personFullName: string,
  scoreValue: number,
  factors: DerivedAttentionSignal[],
) {
  const penalizableFactors = factors.filter(
    (factor) => factor.isPenalizable && factor.contribution > 0,
  );

  if (penalizableFactors.length === 0) {
    return `No se detectaron señales penalizables activas para ${personFullName}.`;
  }

  const topReasons = penalizableFactors.slice(0, 2).map((factor) => factor.summary);
  return `${scoreValue}/100. ${topReasons.join(" ")}`;
}

function buildSnapshotFactors(response: Omit<AttentionProfileResponse, "calculatedAt">) {
  return {
    context: response.context,
    factors: response.factors.map((factor) => ({
      contribution: factor.contribution,
      evidenceCount: factor.evidence.length,
      key: factor.key,
      weight: factor.weight,
    })),
    level: response.score.level,
    reasonSummary: response.reasons.map((reason) => reason.summary),
    score: response.score.value,
    version: response.calculationVersion,
    weights: Object.fromEntries(response.factors.map((factor) => [factor.key, factor.weight])),
  } satisfies Record<string, unknown>;
}

export function buildAttentionScore(input: AttentionScoreInput): AttentionComputedProfile {
  const factors = [...input.factors].sort(compareSignals).map((factor) => ({
    contribution: factor.contribution,
    evidence: factor.evidence,
    isPenalizable: factor.isPenalizable,
    key: factor.key,
    metadata: factor.metadata,
    weight: factor.weight,
  }));
  const scoreValue = Math.min(
    factors.reduce((total, factor) => total + factor.contribution, 0),
    100,
  );
  const scoreLevel = toScoreLevel(scoreValue);
  const reasons = [...input.factors].sort(compareSignals).map((factor) => ({
    impact: toReasonImpact(factor),
    key: factor.key,
    label: factor.label,
    summary: factor.summary,
    weight: factor.weight,
  }));

  const response = {
    calculationVersion: ATTENTION_SCORE_VERSION,
    context: input.context,
    factors,
    personId: input.personId,
    reasons,
    score: {
      level: scoreLevel,
      summary: buildScoreSummary(
        input.personFullName,
        scoreValue,
        [...input.factors].sort(compareSignals),
      ),
      value: scoreValue,
    },
  };

  return {
    ...AttentionProfileResponseSchema.omit({ calculatedAt: true }).parse({
      ...response,
    }),
    snapshotFactors: buildSnapshotFactors({
      ...response,
    }),
  };
}
