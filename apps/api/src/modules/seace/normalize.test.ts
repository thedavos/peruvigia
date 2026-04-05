import { normalizeSeaceDatasets } from "./normalize";
import type { SeaceDownloadedDataset } from "./types";

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
        FECHA_CORTE: "20260405",
        RUC: "20123456789",
        NOMBRE_RAZONODENOMINACIONSOCIAL: "Ana Pérez",
        TIPO_CONF_JURIDICA: "Accionista",
        TIPO_DOCUMENTO: "DNI",
        NUMERO_DOCUMENTO: "12345678",
      },
      {
        FECHA_CORTE: "20260405",
        RUC: "20123456789",
        NOMBRE_RAZONODENOMINACIONSOCIAL: "Ana Pérez",
        TIPO_CONF_JURIDICA: "Accionista",
        TIPO_DOCUMENTO: "DNI",
        NUMERO_DOCUMENTO: "12345678",
      },
    ]),
    createDataset("awards", [
      {
        codigoentidad: "0001",
        entidad: "Municipalidad de Lima",
        tipoprocesoseleccion: "Adjudicación Simplificada",
        proceso: "AS-2026-001",
        descripcion_item: "Servicio de mantenimiento",
        monto_adjudicado_item_soles: "125,000.50",
        moneda: "Soles",
        ruc_proveedor: "20123456789",
        proveedor: "Acme S.A.C.",
        fecha_buenapro: "2026-04-01",
        estado_item: "Consentido",
      },
      {
        codigoentidad: "0001",
        entidad: "Municipalidad de Lima",
        tipoprocesoseleccion: "Adjudicación Simplificada",
        ruc_proveedor: "20123456789",
        proveedor: "Acme S.A.C.",
        proceso: "AS-2026-001",
        fecha_buenapro: "2026-04-01",
        descripcion_item: "Servicio de mantenimiento",
        monto_adjudicado_item_soles: "125,000.50",
        moneda: "Soles",
        estado_item: "Consentido",
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
    normalizedProviderName: "ruc 20123456789",
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
