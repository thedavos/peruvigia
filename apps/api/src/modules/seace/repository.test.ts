import { isSameSeaceSourceRecord } from "./repository.js";

test("isSameSeaceSourceRecord compares payloads and evidence identity", () => {
  const observedAt = new Date("2026-04-05T00:00:00.000Z");
  const baseRecord = {
    id: "00000000-0000-4000-8000-000000000000",
    importedAt: observedAt,
    normalizedPayload: {
      sourceExternalId: "seace:rnp:abc",
    },
    observedAt,
    personId: "11111111-1111-4111-8111-111111111111",
    rawPayload: {
      persona: "Ana Perez",
    },
    sourceCategory: "rnp_people",
    sourceExternalId: "seace:rnp:abc",
    sourceType: "osce_seace",
    sourceUrl: "https://example.com/rnp.csv",
  };

  expect(
    isSameSeaceSourceRecord(baseRecord, {
      normalizedPayload: {
        sourceExternalId: "seace:rnp:abc",
      },
      observedAt,
      personId: "11111111-1111-4111-8111-111111111111",
      rawPayload: {
        persona: "Ana Perez",
      },
      sourceUrl: "https://example.com/rnp.csv",
    }),
  ).toBe(true);

  expect(
    isSameSeaceSourceRecord(baseRecord, {
      normalizedPayload: {
        sourceExternalId: "seace:rnp:def",
      },
      observedAt,
      personId: "11111111-1111-4111-8111-111111111111",
      rawPayload: {
        persona: "Ana Perez",
      },
      sourceUrl: "https://example.com/rnp.csv",
    }),
  ).toBe(false);
});
