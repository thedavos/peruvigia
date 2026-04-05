import { normalizeSeaceDatasets } from "./normalize.js";
import type { SeaceDownloadedDataset } from "./types.js";

function createDataset(
  kind: SeaceDownloadedDataset["kind"],
  records: SeaceDownloadedDataset["records"],
  options: Partial<SeaceDownloadedDataset> = {},
): SeaceDownloadedDataset {
  return {
    body: options.body ?? "",
    contentType: options.contentType ?? "application/json",
    format: options.format ?? "json",
    kind,
    modifiedAt: options.modifiedAt ?? "2026-04-05",
    records,
    sourceUrl: options.sourceUrl ?? `https://example.com/${kind}`,
    title: options.title ?? kind,
  };
}

test("normalizeSeaceDatasets builds stable normalized outputs for the MVP subset", () => {
  const result = normalizeSeaceDatasets([
    createDataset("rnp_people", [
      {
        "Razón Social": "Acme S.A.C.",
        RUC: "20123456789",
        Persona: "Ana Pérez",
        Rol: "Accionista",
        "Tipo Documento": "DNI",
        Documento: "12345678",
        "Fecha Actualización": "05/04/2026",
      },
      {
        "Razón Social": "Acme S.A.C.",
        RUC: "20123456789",
        Persona: "Ana Pérez",
        Rol: "Accionista",
        "Tipo Documento": "DNI",
        Documento: "12345678",
        "Fecha Actualización": "05/04/2026",
      },
    ]),
    createDataset("awards", [
      {
        "Entidad Contratante": "Municipalidad de Lima",
        "RUC Proveedor": "20123456789",
        "Proveedor Adjudicado": "Acme S.A.C.",
        "Código Proceso": "AS-2026-001",
        "Fecha Buena Pro": "2026-04-01",
        "Monto Adjudicado": "125,000.50",
        Moneda: "Soles",
        "Tipo Proceso": "Adjudicación Simplificada",
        Objeto: "Servicio de mantenimiento",
        Estado: "Consentido",
      },
      {
        "Entidad Contratante": "Municipalidad de Lima",
        "RUC Proveedor": "20123456789",
        "Proveedor Adjudicado": "Acme S.A.C.",
        "Código Proceso": "AS-2026-001",
        "Fecha Buena Pro": "2026-04-01",
        "Monto Adjudicado": "125,000.50",
        Moneda: "Soles",
      },
    ]),
    createDataset("contracting_entities", null, {
      body: "<table><tr><th>Código Entidad</th><th>Entidad</th><th>Sigla</th><th>Nivel Gobierno</th><th>Sector</th><th>Estado</th></tr><tr><td>0001</td><td>Municipalidad de Lima</td><td>MML</td><td>Local</td><td>Municipal</td><td>Activo</td></tr></table>",
      contentType: "text/html",
      format: "html",
    }),
  ]);

  expect(result.errors).toEqual([]);
  expect(result.rnpLinks).toHaveLength(1);
  expect(result.awards).toHaveLength(1);
  expect(result.contractingEntities).toHaveLength(1);

  expect(result.rnpLinks[0]).toMatchObject({
    normalizedPersonName: "ana perez",
    normalizedProviderName: "acme s a c",
    personDocumentNumber: "12345678",
    providerDocumentNumber: "20123456789",
    relationshipType: "Accionista",
  });

  expect(result.awards[0]).toMatchObject({
    contractingEntityName: "Municipalidad de Lima",
    currency: "PEN",
    processExternalId: "AS-2026-001",
    supplierDocumentNumber: "20123456789",
    totalAmount: 125000.5,
  });

  expect(result.contractingEntities[0]).toMatchObject({
    acronym: "MML",
    entityExternalId: "0001",
    governmentLevel: "Local",
    normalizedEntityName: "municipalidad de lima",
    sector: "Municipal",
    status: "Activo",
  });
});

test("normalizeSeaceDatasets skips incomplete rows and reports empty datasets", () => {
  const result = normalizeSeaceDatasets([
    createDataset("rnp_people", [
      {
        Persona: "Sin proveedor",
      },
    ]),
    createDataset("awards", [
      {
        "Entidad Contratante": "Entidad sin proveedor",
      },
    ]),
    createDataset("contracting_entities", [
      {
        Sigla: "SIN NOMBRE",
      },
    ]),
  ]);

  expect(result.rnpLinks).toHaveLength(0);
  expect(result.awards).toHaveLength(0);
  expect(result.contractingEntities).toHaveLength(0);
  expect(result.errors).toEqual([
    "No valid RNP relationship rows were normalized from SEACE.",
    "No valid award rows were normalized from SEACE.",
    "No valid contracting entity rows were normalized from SEACE.",
  ]);
  expect(result.skipped).toBe(3);
});
