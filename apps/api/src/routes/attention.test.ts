import { buildApp } from "#api/app.ts";

test("GET /people/:personId/attention-profile returns an explainable attention profile", async () => {
  const app = await buildApp({
    services: {
      getAttentionProfile: async (personId) => ({
        calculationVersion: "attention_v1",
        calculatedAt: "2026-04-05T10:00:00.000Z",
        context: {
          activeSanctionsCount: 1,
          aliases: ["Juana Perez", "juana perez"],
          awardsCount: 2,
          entityLinksCount: 1,
          personLinksCount: 1,
          relatedSuppliersCount: 1,
        },
        factors: [
          {
            contribution: 70,
            evidence: [
              {
                detail: "Inhabilitacion en Municipalidad de Lima",
                observedAt: null,
                sourceExternalId:
                  "contraloria:ley_31288:dni:12345678:res:abc-2026:type:inhabilitacion",
                sourceRecordId: "11111111-1111-4111-8111-111111111111",
                sourceType: "contraloria_sanciones",
                sourceUrl: "https://example.com/report",
              },
            ],
            isPenalizable: true,
            key: "contraloria_sanction_active",
            metadata: {
              count: 1,
            },
            weight: 70,
          },
        ],
        personId,
        reasons: [
          {
            impact: "high",
            key: "contraloria_sanction_active",
            label: "Sancion activa",
            summary: "1 sancion(es) activa(s) detectadas en Contraloria.",
            weight: 70,
          },
        ],
        score: {
          level: "critical",
          summary: "70/100. 1 sancion(es) activa(s) detectadas en Contraloria.",
          value: 70,
        },
      }),
    },
  });

  const response = await app.inject({
    method: "GET",
    url: "/people/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/attention-profile",
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({
    calculationVersion: "attention_v1",
    calculatedAt: "2026-04-05T10:00:00.000Z",
    context: {
      activeSanctionsCount: 1,
      aliases: ["Juana Perez", "juana perez"],
      awardsCount: 2,
      entityLinksCount: 1,
      personLinksCount: 1,
      relatedSuppliersCount: 1,
    },
    factors: [
      {
        contribution: 70,
        evidence: [
          {
            detail: "Inhabilitacion en Municipalidad de Lima",
            observedAt: null,
            sourceExternalId: "contraloria:ley_31288:dni:12345678:res:abc-2026:type:inhabilitacion",
            sourceRecordId: "11111111-1111-4111-8111-111111111111",
            sourceType: "contraloria_sanciones",
            sourceUrl: "https://example.com/report",
          },
        ],
        isPenalizable: true,
        key: "contraloria_sanction_active",
        metadata: {
          count: 1,
        },
        weight: 70,
      },
    ],
    personId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    reasons: [
      {
        impact: "high",
        key: "contraloria_sanction_active",
        label: "Sancion activa",
        summary: "1 sancion(es) activa(s) detectadas en Contraloria.",
        weight: 70,
      },
    ],
    score: {
      level: "critical",
      summary: "70/100. 1 sancion(es) activa(s) detectadas en Contraloria.",
      value: 70,
    },
  });

  await app.close();
});

test("GET /people/:personId/attention-profile returns 404 when person does not exist", async () => {
  const app = await buildApp({
    services: {
      getAttentionProfile: async () => null,
    },
  });

  const response = await app.inject({
    method: "GET",
    url: "/people/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/attention-profile",
  });

  expect(response.statusCode).toBe(404);
  expect(response.json()).toEqual({
    message: "Person aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa was not found.",
  });

  await app.close();
});
