import { buildAttentionScore } from "#api/modules/attention/score.ts";
import type { DerivedAttentionSignal } from "#api/modules/attention/types.ts";

function buildSignal(overrides: Partial<DerivedAttentionSignal> = {}): DerivedAttentionSignal {
  return {
    contribution: 0,
    evidence: [],
    isPenalizable: false,
    key: "supplier_relationship_context",
    label: "Proveedor relacionado",
    metadata: {},
    summary: "Proveedor relacionado en contexto.",
    weight: 0,
    ...overrides,
  };
}

test("buildAttentionScore keeps context-only factors at zero", () => {
  const result = buildAttentionScore({
    context: {
      activeSanctionsCount: 0,
      aliases: ["Juana Perez"],
      awardsCount: 0,
      entityLinksCount: 1,
      personLinksCount: 0,
      relatedSuppliersCount: 1,
    },
    factors: [
      buildSignal(),
      buildSignal({
        key: "dji_declared_commercial_link_context",
        label: "Contexto comercial declarado",
        summary: "1 vinculo(s) comercial(es) declarados en DJI.",
      }),
    ],
    personId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    personFullName: "Juana Perez",
  });

  expect(result.score.value).toBe(0);
  expect(result.score.level).toBe("low");
  expect(result.score.summary).toBe(
    "No se detectaron señales penalizables activas para Juana Perez.",
  );
});

test("buildAttentionScore sums deterministic penalizable factors", () => {
  const result = buildAttentionScore({
    context: {
      activeSanctionsCount: 1,
      aliases: ["Juana Perez"],
      awardsCount: 4,
      entityLinksCount: 1,
      personLinksCount: 1,
      relatedSuppliersCount: 1,
    },
    factors: [
      buildSignal({
        contribution: 70,
        isPenalizable: true,
        key: "contraloria_sanction_active",
        label: "Sancion activa",
        summary: "1 sancion(es) activa(s) detectadas en Contraloria.",
        weight: 70,
      }),
      buildSignal({
        contribution: 10,
        isPenalizable: true,
        key: "supplier_match_with_declared_provider",
        label: "Coincidencia con proveedor",
        summary: "1 proveedor(es) relacionados registran actividad contractual en SEACE.",
        weight: 10,
      }),
      buildSignal({
        contribution: 8,
        isPenalizable: true,
        key: "contracting_activity_with_related_supplier",
        label: "Actividad contractual relevante",
        summary:
          "La actividad contractual asociada a proveedores relacionados suma 4 adjudicacion(es).",
        weight: 8,
      }),
    ],
    personId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    personFullName: "Juana Perez",
  });

  expect(result.score.value).toBe(88);
  expect(result.score.level).toBe("critical");
  expect(result.reasons.map((reason) => reason.key)).toEqual([
    "contraloria_sanction_active",
    "supplier_match_with_declared_provider",
    "contracting_activity_with_related_supplier",
  ]);
});
