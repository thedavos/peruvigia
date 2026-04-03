import { buildApp } from "#api/app.js";

test("GET /people/:personId/dji-context returns declared entity and person links", async () => {
  const app = await buildApp({
    services: {
      getDjiContext: async (personId) => ({
        entityLinks: [
          {
            detail: "Accionista",
            endDate: null,
            entity: {
              entityId: "11111111-1111-4111-8111-111111111111",
              entityType: "commercial_entity",
              externalIdentifier: "20123456789",
              name: "Acme SAC",
            },
            evidence: {
              declarationExternalId: "DECL-1",
              observedAt: "2026-03-30T00:00:00.000Z",
              sourceRecordId: "22222222-2222-4222-8222-222222222222",
              sourceUrl: "https://example.com/declarations.json",
            },
            linkId: "33333333-3333-4333-8333-333333333333",
            linkType: "commercial",
            startDate: "2024-01-01",
          },
        ],
        personId,
        personLinks: [
          {
            detail: "Hermano",
            endDate: null,
            evidence: {
              declarationExternalId: "DECL-1",
              observedAt: "2026-03-30T00:00:00.000Z",
              sourceRecordId: "22222222-2222-4222-8222-222222222222",
              sourceUrl: "https://example.com/declarations.json",
            },
            linkId: "44444444-4444-4444-8444-444444444444",
            linkType: "family",
            relatedPerson: {
              documentNumber: null,
              fullName: "Carlos Perez",
              personId: "55555555-5555-4555-8555-555555555555",
            },
            startDate: null,
          },
        ],
      }),
    },
  });

  const response = await app.inject({
    method: "GET",
    url: "/people/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/dji-context",
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({
    entityLinks: [
      {
        detail: "Accionista",
        endDate: null,
        entity: {
          entityId: "11111111-1111-4111-8111-111111111111",
          entityType: "commercial_entity",
          externalIdentifier: "20123456789",
          name: "Acme SAC",
        },
        evidence: {
          declarationExternalId: "DECL-1",
          observedAt: "2026-03-30T00:00:00.000Z",
          sourceRecordId: "22222222-2222-4222-8222-222222222222",
          sourceUrl: "https://example.com/declarations.json",
        },
        linkId: "33333333-3333-4333-8333-333333333333",
        linkType: "commercial",
        startDate: "2024-01-01",
      },
    ],
    personId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    personLinks: [
      {
        detail: "Hermano",
        endDate: null,
        evidence: {
          declarationExternalId: "DECL-1",
          observedAt: "2026-03-30T00:00:00.000Z",
          sourceRecordId: "22222222-2222-4222-8222-222222222222",
          sourceUrl: "https://example.com/declarations.json",
        },
        linkId: "44444444-4444-4444-8444-444444444444",
        linkType: "family",
        relatedPerson: {
          documentNumber: null,
          fullName: "Carlos Perez",
          personId: "55555555-5555-4555-8555-555555555555",
        },
        startDate: null,
      },
    ],
  });

  await app.close();
});

test("GET /people/:personId/dji-context returns 404 when person does not exist", async () => {
  const app = await buildApp({
    services: {
      getDjiContext: async () => null,
    },
  });

  const response = await app.inject({
    method: "GET",
    url: "/people/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/dji-context",
  });

  expect(response.statusCode).toBe(404);
  expect(response.json()).toEqual({
    message: "Person aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa was not found.",
  });

  await app.close();
});
