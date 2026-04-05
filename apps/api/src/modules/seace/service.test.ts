import { runSeaceSync } from "./service.js";
import type { SeaceDownloadedDataset, SeaceNormalizationResult, SeaceSyncResult } from "./types.js";

const fakeDatabaseClient = {} as never;

test("runSeaceSync merges normalization and persistence results", async () => {
  const datasets: SeaceDownloadedDataset[] = [
    {
      body: "",
      contentType: "application/json",
      format: "json",
      kind: "rnp_people",
      modifiedAt: "2026-04-05",
      records: [],
      sourceUrl: "https://example.com/rnp.json",
      title: "rnp_people",
    },
    {
      body: "",
      contentType: "application/json",
      format: "json",
      kind: "awards",
      modifiedAt: "2026-04-05",
      records: [],
      sourceUrl: "https://example.com/awards.json",
      title: "awards",
    },
    {
      body: "",
      contentType: "application/json",
      format: "json",
      kind: "contracting_entities",
      modifiedAt: "2026-04-05",
      records: [],
      sourceUrl: "https://example.com/entities.json",
      title: "contracting_entities",
    },
  ];

  const normalized: SeaceNormalizationResult = {
    awards: [],
    contractingEntities: [],
    errors: ["normalization warning"],
    rnpLinks: [
      {
        normalizedPersonName: "ana perez",
        normalizedProviderName: "acme",
        observedAt: "2026-04-05",
        personDocumentNumber: "12345678",
        personDocumentType: "DNI",
        personFullName: "Ana Perez",
        providerDocumentNumber: "20123456789",
        providerExternalId: "20123456789",
        providerName: "Acme SAC",
        rawPayload: {},
        relationshipType: "Accionista",
        sourceExternalId: "seace:rnp:1",
        sourceUrl: "https://example.com/rnp.json",
      },
    ],
    skipped: 2,
  };

  const persisted: SeaceSyncResult = {
    errors: ["persistence warning"],
    summary: {
      downloaded: 3,
      failed: 0,
      inserted: 1,
      processed: 1,
      reused: 0,
      skipped: 2,
      updated: 0,
    },
  };

  const result = await runSeaceSync({}, fakeDatabaseClient, {
    acquireDatasets: async () => datasets,
    getLatestImportedObservedAt: async () => null,
    normalizeDatasets: () => normalized,
    persistRecords: async (_records, _options) => persisted,
  });

  expect(result.errors).toEqual(["normalization warning", "persistence warning"]);
  expect(result.summary).toEqual(persisted.summary);
});

test("runSeaceSync rejects older evidence unless allowBackfill is set", async () => {
  const datasets: SeaceDownloadedDataset[] = [];
  const normalized: SeaceNormalizationResult = {
    awards: [],
    contractingEntities: [],
    errors: [],
    rnpLinks: [
      {
        normalizedPersonName: "ana perez",
        normalizedProviderName: "acme",
        observedAt: "2026-04-01",
        personDocumentNumber: "12345678",
        personDocumentType: "DNI",
        personFullName: "Ana Perez",
        providerDocumentNumber: "20123456789",
        providerExternalId: "20123456789",
        providerName: "Acme SAC",
        rawPayload: {},
        relationshipType: "Accionista",
        sourceExternalId: "seace:rnp:1",
        sourceUrl: "https://example.com/rnp.json",
      },
    ],
    skipped: 0,
  };

  await expect(
    runSeaceSync({}, fakeDatabaseClient, {
      acquireDatasets: async () => datasets,
      getLatestImportedObservedAt: async () => "2026-04-05",
      normalizeDatasets: () => normalized,
      persistRecords: async () => {
        throw new Error("should not persist");
      },
    }),
  ).rejects.toThrow("Refusing to import SEACE records dated 2026-04-01");
});
