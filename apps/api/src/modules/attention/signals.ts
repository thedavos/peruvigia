import { compactText } from "@peruvigia/shared";

import { CONTRALORIA_SOURCE_TYPE } from "#api/modules/contraloria/types.ts";
import { DJI_SOURCE_TYPE } from "#api/modules/dji/types.ts";
import { SEACE_SOURCE_TYPE } from "#api/modules/seace/types.ts";
import type {
  AttentionContextInput,
  AttentionEvidenceRef,
  DerivedAttentionSignal,
} from "./types.ts";

function dedupeEvidence(evidence: AttentionEvidenceRef[]) {
  const evidenceByKey = new Map<string, AttentionEvidenceRef>();

  for (const entry of evidence) {
    const key = [
      entry.sourceType,
      entry.sourceRecordId,
      entry.sourceExternalId ?? "",
      entry.detail,
    ].join(":");

    evidenceByKey.set(key, entry);
  }

  return [...evidenceByKey.values()];
}

function buildSignal(
  signal: Omit<DerivedAttentionSignal, "evidence"> & {
    evidence: AttentionEvidenceRef[];
  },
): DerivedAttentionSignal {
  return {
    ...signal,
    evidence: dedupeEvidence(signal.evidence),
  };
}

function describeDjiEntityLink(
  entityLink: AttentionContextInput["djiContext"]["entityLinks"][number],
) {
  return compactText(
    [entityLink.entity.name, entityLink.detail, entityLink.linkType].filter(Boolean).join(" · "),
  );
}

function describeDjiPersonLink(
  personLink: AttentionContextInput["djiContext"]["personLinks"][number],
) {
  return compactText(
    [
      personLink.relatedPerson.fullName,
      personLink.detail,
      personLink.linkType === "family" ? "vinculo familiar declarado" : personLink.linkType,
    ]
      .filter(Boolean)
      .join(" · "),
  );
}

function describeSupplierRelationship(
  relationship: AttentionContextInput["supplierRelationships"][number],
) {
  return compactText(
    [
      relationship.entity.name,
      relationship.declaredRole,
      relationship.detail,
      "proveedor relacionado",
    ]
      .filter(Boolean)
      .join(" · "),
  );
}

function describeAward(
  record: AttentionContextInput["matches"]["supplierProviderMatches"][number]["awards"][number],
) {
  return compactText(
    [
      record.supplier.name,
      "adjudicado por",
      record.contractingEntity.name,
      record.processExternalId,
    ]
      .filter(Boolean)
      .join(" · "),
  );
}

export function deriveAttentionSignals(input: AttentionContextInput): DerivedAttentionSignal[] {
  const derivedSignals: DerivedAttentionSignal[] = [];
  const commercialEntityLinks = input.djiContext.entityLinks.filter(
    (link) => link.linkType === "commercial",
  );
  const boardEntityLinks = input.djiContext.entityLinks.filter(
    (link) => link.linkType === "board_membership",
  );
  const employmentEntityLinks = input.djiContext.entityLinks.filter(
    (link) => link.linkType === "employment",
  );
  const guildEntityLinks = input.djiContext.entityLinks.filter((link) => link.linkType === "guild");
  const familyPersonLinks = input.djiContext.personLinks.filter(
    (link) => link.linkType === "family",
  );

  if (commercialEntityLinks.length > 0) {
    derivedSignals.push(
      buildSignal({
        contribution: 0,
        evidence: commercialEntityLinks.map((link) => ({
          detail: describeDjiEntityLink(link) ?? "Vinculo comercial declarado",
          observedAt: link.evidence.observedAt,
          sourceExternalId: link.evidence.declarationExternalId,
          sourceRecordId: link.evidence.sourceRecordId,
          sourceType: DJI_SOURCE_TYPE,
          sourceUrl: link.evidence.sourceUrl,
        })),
        isPenalizable: false,
        key: "dji_declared_commercial_link_context",
        label: "Contexto comercial declarado",
        metadata: {
          count: commercialEntityLinks.length,
        },
        summary: `${commercialEntityLinks.length} vinculo(s) comercial(es) declarados en DJI.`,
        weight: 0,
      }),
    );
  }

  if (familyPersonLinks.length > 0) {
    derivedSignals.push(
      buildSignal({
        contribution: 0,
        evidence: familyPersonLinks.map((link) => ({
          detail: describeDjiPersonLink(link) ?? "Vinculo familiar declarado",
          observedAt: link.evidence.observedAt,
          sourceExternalId: link.evidence.declarationExternalId,
          sourceRecordId: link.evidence.sourceRecordId,
          sourceType: DJI_SOURCE_TYPE,
          sourceUrl: link.evidence.sourceUrl,
        })),
        isPenalizable: false,
        key: "dji_declared_family_link_context",
        label: "Contexto familiar declarado",
        metadata: {
          count: familyPersonLinks.length,
        },
        summary: `${familyPersonLinks.length} vinculo(s) familiar(es) declarados en DJI.`,
        weight: 0,
      }),
    );
  }

  if (boardEntityLinks.length > 0) {
    derivedSignals.push(
      buildSignal({
        contribution: 0,
        evidence: boardEntityLinks.map((link) => ({
          detail: describeDjiEntityLink(link) ?? "Participacion en directorio declarada",
          observedAt: link.evidence.observedAt,
          sourceExternalId: link.evidence.declarationExternalId,
          sourceRecordId: link.evidence.sourceRecordId,
          sourceType: DJI_SOURCE_TYPE,
          sourceUrl: link.evidence.sourceUrl,
        })),
        isPenalizable: false,
        key: "dji_declared_board_link_context",
        label: "Contexto societario declarado",
        metadata: {
          count: boardEntityLinks.length,
        },
        summary: `${boardEntityLinks.length} participacion(es) en directorio declaradas en DJI.`,
        weight: 0,
      }),
    );
  }

  if (employmentEntityLinks.length > 0) {
    derivedSignals.push(
      buildSignal({
        contribution: 0,
        evidence: employmentEntityLinks.map((link) => ({
          detail: describeDjiEntityLink(link) ?? "Relacion laboral declarada",
          observedAt: link.evidence.observedAt,
          sourceExternalId: link.evidence.declarationExternalId,
          sourceRecordId: link.evidence.sourceRecordId,
          sourceType: DJI_SOURCE_TYPE,
          sourceUrl: link.evidence.sourceUrl,
        })),
        isPenalizable: false,
        key: "dji_declared_employment_link_context",
        label: "Contexto laboral declarado",
        metadata: {
          count: employmentEntityLinks.length,
        },
        summary: `${employmentEntityLinks.length} relacion(es) laboral(es) declaradas en DJI.`,
        weight: 0,
      }),
    );
  }

  if (guildEntityLinks.length > 0) {
    derivedSignals.push(
      buildSignal({
        contribution: 0,
        evidence: guildEntityLinks.map((link) => ({
          detail: describeDjiEntityLink(link) ?? "Afiliacion gremial declarada",
          observedAt: link.evidence.observedAt,
          sourceExternalId: link.evidence.declarationExternalId,
          sourceRecordId: link.evidence.sourceRecordId,
          sourceType: DJI_SOURCE_TYPE,
          sourceUrl: link.evidence.sourceUrl,
        })),
        isPenalizable: false,
        key: "dji_declared_guild_link_context",
        label: "Contexto gremial declarado",
        metadata: {
          count: guildEntityLinks.length,
        },
        summary: `${guildEntityLinks.length} afiliacion(es) gremial(es) declaradas en DJI.`,
        weight: 0,
      }),
    );
  }

  if (input.supplierRelationships.length > 0) {
    derivedSignals.push(
      buildSignal({
        contribution: 0,
        evidence: input.supplierRelationships.map((relationship) => ({
          detail: describeSupplierRelationship(relationship) ?? "Proveedor relacionado",
          observedAt: relationship.evidence.observedAt,
          sourceExternalId: relationship.evidence.sourceExternalId,
          sourceRecordId: relationship.evidence.sourceRecordId,
          sourceType: SEACE_SOURCE_TYPE,
          sourceUrl: relationship.evidence.sourceUrl,
        })),
        isPenalizable: false,
        key: "supplier_relationship_context",
        label: "Proveedor relacionado",
        metadata: {
          count: input.supplierRelationships.length,
        },
        summary: `${input.supplierRelationships.length} proveedor(es) relacionados identificados en SEACE/RNP.`,
        weight: 0,
      }),
    );
  }

  if (input.contraloriaStatus.activeSignals.length > 0) {
    derivedSignals.push(
      buildSignal({
        contribution: 70,
        evidence: input.contraloriaStatus.activeSignals.map((signal) => ({
          detail: signal.summary,
          observedAt: null,
          sourceExternalId: signal.canonicalKey,
          sourceRecordId: signal.sourceRecordId,
          sourceType: CONTRALORIA_SOURCE_TYPE,
          sourceUrl: signal.reportUrl,
        })),
        isPenalizable: true,
        key: "contraloria_sanction_active",
        label: "Sancion activa",
        metadata: {
          count: input.contraloriaStatus.activeSignals.length,
          signalIds: input.contraloriaStatus.activeSignals.map((signal) => signal.signalId),
        },
        summary: `${input.contraloriaStatus.activeSignals.length} sancion(es) activa(s) detectadas en Contraloria.`,
        weight: 70,
      }),
    );
  }

  if (input.contraloriaStatus.contextSignals.length > 0) {
    derivedSignals.push(
      buildSignal({
        contribution: 15,
        evidence: input.contraloriaStatus.contextSignals.map((signal) => ({
          detail: signal.summary,
          observedAt: null,
          sourceExternalId: signal.canonicalKey,
          sourceRecordId: signal.sourceRecordId,
          sourceType: CONTRALORIA_SOURCE_TYPE,
          sourceUrl: signal.reportUrl,
        })),
        isPenalizable: true,
        key: "contraloria_sanction_historical",
        label: "Antecedente de sancion",
        metadata: {
          count: input.contraloriaStatus.contextSignals.length,
          signalIds: input.contraloriaStatus.contextSignals.map((signal) => signal.signalId),
        },
        summary: `${input.contraloriaStatus.contextSignals.length} antecedente(s) de sancion registrados en Contraloria.`,
        weight: 15,
      }),
    );
  }

  if (input.matches.commercialEntityMatches.length > 0) {
    const evidence = input.matches.commercialEntityMatches.flatMap((match) => [
      {
        detail: describeDjiEntityLink(match.entityLink) ?? "Entidad comercial declarada",
        observedAt: match.entityLink.evidence.observedAt,
        sourceExternalId: match.entityLink.evidence.declarationExternalId,
        sourceRecordId: match.entityLink.evidence.sourceRecordId,
        sourceType: DJI_SOURCE_TYPE,
        sourceUrl: match.entityLink.evidence.sourceUrl,
      },
      ...match.supplierRelationships.map((relationship) => ({
        detail: describeSupplierRelationship(relationship) ?? "Proveedor relacionado",
        observedAt: relationship.evidence.observedAt,
        sourceExternalId: relationship.evidence.sourceExternalId,
        sourceRecordId: relationship.evidence.sourceRecordId,
        sourceType: SEACE_SOURCE_TYPE,
        sourceUrl: relationship.evidence.sourceUrl,
      })),
      ...match.awards.map((award) => ({
        detail: describeAward(award) ?? "Actividad contractual relacionada",
        observedAt: award.observedAt,
        sourceExternalId: award.sourceExternalId,
        sourceRecordId: award.sourceRecordId,
        sourceType: SEACE_SOURCE_TYPE,
        sourceUrl: award.sourceUrl,
      })),
    ]);

    derivedSignals.push(
      buildSignal({
        contribution: 12,
        evidence,
        isPenalizable: true,
        key: "commercial_match_with_declared_entity",
        label: "Coincidencia comercial",
        metadata: {
          matchedEntities: input.matches.commercialEntityMatches.map((match) => ({
            awardsCount: match.awards.length,
            entityId: match.entityLink.entity.entityId,
            entityName: match.entityLink.entity.name,
            supplierRelationshipsCount: match.supplierRelationships.length,
          })),
        },
        summary: `${input.matches.commercialEntityMatches.length} entidad(es) comerciales declaradas reaparecen en cruces de proveedor o contratacion.`,
        weight: 12,
      }),
    );
  }

  if (input.matches.supplierProviderMatches.length > 0) {
    const awardsCount = input.matches.supplierProviderMatches.reduce(
      (count, match) => count + match.awards.length,
      0,
    );

    derivedSignals.push(
      buildSignal({
        contribution: 10,
        evidence: input.matches.supplierProviderMatches.flatMap((match) => [
          {
            detail:
              describeSupplierRelationship(match.supplierRelationship) ?? "Proveedor relacionado",
            observedAt: match.supplierRelationship.evidence.observedAt,
            sourceExternalId: match.supplierRelationship.evidence.sourceExternalId,
            sourceRecordId: match.supplierRelationship.evidence.sourceRecordId,
            sourceType: SEACE_SOURCE_TYPE,
            sourceUrl: match.supplierRelationship.evidence.sourceUrl,
          },
          ...match.awards.map((award) => ({
            detail: describeAward(award) ?? "Actividad contractual del proveedor",
            observedAt: award.observedAt,
            sourceExternalId: award.sourceExternalId,
            sourceRecordId: award.sourceRecordId,
            sourceType: SEACE_SOURCE_TYPE,
            sourceUrl: award.sourceUrl,
          })),
        ]),
        isPenalizable: true,
        key: "supplier_match_with_declared_provider",
        label: "Coincidencia con proveedor",
        metadata: {
          awardsCount,
          suppliers: input.matches.supplierProviderMatches.map((match) => ({
            awardsCount: match.awards.length,
            entityId: match.supplierRelationship.entity.entityId,
            entityName: match.supplierRelationship.entity.name,
          })),
        },
        summary: `${input.matches.supplierProviderMatches.length} proveedor(es) relacionados registran actividad contractual en SEACE.`,
        weight: 10,
      }),
    );

    const totalAmount = input.matches.supplierProviderMatches.reduce(
      (amount, match) =>
        amount +
        match.awards.reduce((awardAmount, award) => awardAmount + (award.totalAmount ?? 0), 0),
      0,
    );

    if (awardsCount >= 3 || totalAmount >= 100_000) {
      derivedSignals.push(
        buildSignal({
          contribution: 8,
          evidence: input.matches.supplierProviderMatches.flatMap((match) =>
            match.awards.map((award) => ({
              detail: describeAward(award) ?? "Actividad contractual del proveedor",
              observedAt: award.observedAt,
              sourceExternalId: award.sourceExternalId,
              sourceRecordId: award.sourceRecordId,
              sourceType: SEACE_SOURCE_TYPE,
              sourceUrl: award.sourceUrl,
            })),
          ),
          isPenalizable: true,
          key: "contracting_activity_with_related_supplier",
          label: "Actividad contractual relevante",
          metadata: {
            awardsCount,
            totalAmount,
          },
          summary: `La actividad contractual asociada a proveedores relacionados suma ${awardsCount} adjudicacion(es).`,
          weight: 8,
        }),
      );
    }
  }

  return derivedSignals;
}
