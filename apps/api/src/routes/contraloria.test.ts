import { buildApp } from "#api/app.js";

test("GET /people/:personId/contraloria-status returns grouped signals", async () => {
  const app = await buildApp({
    services: {
      getContraloriaStatus: async (personId) => ({
        activeSignals: [
          {
            attachmentUrl: "https://example.com/active.xlsx",
            canonicalKey: "contraloria:ley_31288:dni:12345678:res:abc-2026:type:inhabilitacion",
            endDate: null,
            entityName: "Municipalidad de Lima",
            isActive: true,
            reportUrl: "https://example.com/report",
            resolutionDate: "2026-03-27",
            resolutionNumber: "ABC-2026",
            sanctionType: "Inhabilitacion",
            signalId: "11111111-1111-4111-8111-111111111111",
            signalType: "contraloria_sanction_active",
            sourceRecordId: "22222222-2222-4222-8222-222222222222",
            startDate: "2026-01-01",
            summary: "Inhabilitacion en Municipalidad de Lima",
            title: "Sancion vigente: Juana Perez",
          },
        ],
        contextSignals: [
          {
            attachmentUrl: "https://example.com/historical.xlsx",
            canonicalKey: "contraloria:ley_29622:dni:12345678:res:old-2024:type:amonestacion",
            endDate: "2024-12-31",
            entityName: "Municipalidad de Lima",
            isActive: false,
            reportUrl: "https://example.com/report",
            resolutionDate: "2024-01-20",
            resolutionNumber: "OLD-2024",
            sanctionType: "Amonestacion",
            signalId: "33333333-3333-4333-8333-333333333333",
            signalType: "contraloria_sanction_historical",
            sourceRecordId: "44444444-4444-4444-8444-444444444444",
            startDate: "2024-01-01",
            summary: "Amonestacion en Municipalidad de Lima",
            title: "Antecedente de sancion: Juana Perez",
          },
        ],
        hasActiveSanction: true,
        personId,
      }),
    },
  });

  const response = await app.inject({
    method: "GET",
    url: "/people/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/contraloria-status",
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({
    activeSignals: [
      {
        attachmentUrl: "https://example.com/active.xlsx",
        canonicalKey: "contraloria:ley_31288:dni:12345678:res:abc-2026:type:inhabilitacion",
        endDate: null,
        entityName: "Municipalidad de Lima",
        isActive: true,
        reportUrl: "https://example.com/report",
        resolutionDate: "2026-03-27",
        resolutionNumber: "ABC-2026",
        sanctionType: "Inhabilitacion",
        signalId: "11111111-1111-4111-8111-111111111111",
        signalType: "contraloria_sanction_active",
        sourceRecordId: "22222222-2222-4222-8222-222222222222",
        startDate: "2026-01-01",
        summary: "Inhabilitacion en Municipalidad de Lima",
        title: "Sancion vigente: Juana Perez",
      },
    ],
    contextSignals: [
      {
        attachmentUrl: "https://example.com/historical.xlsx",
        canonicalKey: "contraloria:ley_29622:dni:12345678:res:old-2024:type:amonestacion",
        endDate: "2024-12-31",
        entityName: "Municipalidad de Lima",
        isActive: false,
        reportUrl: "https://example.com/report",
        resolutionDate: "2024-01-20",
        resolutionNumber: "OLD-2024",
        sanctionType: "Amonestacion",
        signalId: "33333333-3333-4333-8333-333333333333",
        signalType: "contraloria_sanction_historical",
        sourceRecordId: "44444444-4444-4444-8444-444444444444",
        startDate: "2024-01-01",
        summary: "Amonestacion en Municipalidad de Lima",
        title: "Antecedente de sancion: Juana Perez",
      },
    ],
    hasActiveSanction: true,
    personId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  });

  await app.close();
});
