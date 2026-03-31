import { isSameDjiSourceRecord, buildRelatedPersonReuseKey } from "./repository.js";

test("buildRelatedPersonReuseKey is stable for equivalent family links", () => {
  const left = buildRelatedPersonReuseKey({
    detail: "Hermano",
    documentNumber: null,
    endDate: null,
    fullName: "Carlos Perez",
    linkType: "family",
    metadata: {},
    normalizedName: "carlos perez",
    rawPayload: {},
    startDate: "2024-01-01",
  });

  const right = buildRelatedPersonReuseKey({
    detail: "Hermano",
    documentNumber: null,
    endDate: null,
    fullName: "Carlos Perez",
    linkType: "family",
    metadata: {
      ignored: true,
    },
    normalizedName: "carlos perez",
    rawPayload: {
      source: "raw",
    },
    startDate: "2024-01-01",
  });

  expect(left).toBe(right);
});

test("isSameDjiSourceRecord compares payloads and evidence identity", () => {
  const observedAt = new Date("2026-03-31T00:00:00.000Z");
  const baseRecord = {
    id: "00000000-0000-4000-8000-000000000000",
    importedAt: observedAt,
    normalizedPayload: {
      declarationExternalId: "DECL-1",
    },
    observedAt,
    personId: "11111111-1111-4111-8111-111111111111",
    rawPayload: {
      declaration: {
        id: "DECL-1",
      },
    },
    sourceCategory: "declaration",
    sourceExternalId: "DECL-1",
    sourceType: "pcm_dji",
    sourceUrl: "https://example.com/declarations.json",
  };

  expect(
    isSameDjiSourceRecord(baseRecord, {
      normalizedPayload: {
        declarationExternalId: "DECL-1",
      },
      observedAt,
      personId: "11111111-1111-4111-8111-111111111111",
      rawPayload: {
        declaration: {
          id: "DECL-1",
        },
      },
      sourceUrl: "https://example.com/declarations.json",
    }),
  ).toBe(true);

  expect(
    isSameDjiSourceRecord(baseRecord, {
      normalizedPayload: {
        declarationExternalId: "DECL-2",
      },
      observedAt,
      personId: "11111111-1111-4111-8111-111111111111",
      rawPayload: {
        declaration: {
          id: "DECL-1",
        },
      },
      sourceUrl: "https://example.com/declarations.json",
    }),
  ).toBe(false);
});
