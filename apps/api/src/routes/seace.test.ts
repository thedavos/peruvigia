import { buildApp } from "#api/app";

test("GET /seace/activity returns the simplified contractual activity view", async () => {
  const app = await buildApp({
    services: {
      getSeaceActivity: async () => [
        {
          awardedAt: "2026-04-01",
          contractingEntity: {
            externalIdentifier: "0001",
            name: "Municipalidad de Lima",
          },
          currency: "PEN",
          objectDescription: "Servicio de mantenimiento",
          observedAt: "2026-04-05T00:00:00.000Z",
          processExternalId: "AS-2026-001",
          processType: "Adjudicación Simplificada",
          sourceExternalId: "seace:award:1",
          sourceRecordId: "11111111-1111-4111-8111-111111111111",
          sourceUrl: "https://example.com/awards.xlsx",
          status: "Consentido",
          supplier: {
            documentNumber: "20123456789",
            externalIdentifier: "20123456789",
            name: "Acme SAC",
          },
          totalAmount: 125000.5,
        },
      ],
    },
  });

  const response = await app.inject({
    method: "GET",
    url: "/seace/activity?supplierDocumentNumber=20123456789&limit=10",
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual([
    {
      awardedAt: "2026-04-01",
      contractingEntity: {
        externalIdentifier: "0001",
        name: "Municipalidad de Lima",
      },
      currency: "PEN",
      objectDescription: "Servicio de mantenimiento",
      observedAt: "2026-04-05T00:00:00.000Z",
      processExternalId: "AS-2026-001",
      processType: "Adjudicación Simplificada",
      sourceExternalId: "seace:award:1",
      sourceRecordId: "11111111-1111-4111-8111-111111111111",
      sourceUrl: "https://example.com/awards.xlsx",
      status: "Consentido",
      supplier: {
        documentNumber: "20123456789",
        externalIdentifier: "20123456789",
        name: "Acme SAC",
      },
      totalAmount: 125000.5,
    },
  ]);

  await app.close();
});

test("GET /seace/activity forwards query filters to the service", async () => {
  const calls: Array<Record<string, unknown> | undefined> = [];
  const app = await buildApp({
    services: {
      getSeaceActivity: async (filters) => {
        calls.push(filters);
        return [];
      },
    },
  });

  const response = await app.inject({
    method: "GET",
    url: "/seace/activity?contractingEntityExternalId=0001&processExternalId=AS-2026-001&supplierExternalId=20123456789&limit=5",
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual([]);
  expect(calls).toEqual([
    {
      contractingEntityExternalId: "0001",
      limit: 5,
      processExternalId: "AS-2026-001",
      supplierExternalId: "20123456789",
    },
  ]);

  await app.close();
});
