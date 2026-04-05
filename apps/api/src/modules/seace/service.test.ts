import { mapSeaceAwardActivityRecord, runSeaceSync } from "./service.js";
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

test("mapSeaceAwardActivityRecord projects persisted award payloads into a simplified view", () => {
  const result = mapSeaceAwardActivityRecord({
    importedAt: new Date("2026-04-05T15:00:00.000Z"),
    normalizedPayload: {
      awardedAt: "2026-04-01",
      contractingEntityExternalId: "0001",
      contractingEntityName: "Municipalidad de Lima",
      currency: "PEN",
      objectDescription: "Servicio de mantenimiento",
      processExternalId: "AS-2026-001",
      processType: "Adjudicación Simplificada",
      status: "Consentido",
      supplierDocumentNumber: "20123456789",
      supplierExternalId: "20123456789",
      supplierName: "Acme SAC",
      totalAmount: 125000.5,
    },
    observedAt: new Date("2026-04-05T00:00:00.000Z"),
    sourceExternalId: "seace:award:1",
    sourceRecordId: "11111111-1111-4111-8111-111111111111",
    sourceUrl: "https://example.com/awards.xlsx",
  });

  expect(result).toEqual({
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
  });
});
