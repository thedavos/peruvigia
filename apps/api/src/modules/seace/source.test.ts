import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";

import { acquireSeaceDatasets, resolveSeaceResourcesFromCatalog } from "./source.js";

test("resolveSeaceResourcesFromCatalog picks the right resource for each MVP dataset", () => {
  const resources = resolveSeaceResourcesFromCatalog([
    {
      id: "rnp",
      modifiedAt: "2026-04-05",
      resources: [
        {
          format: "CSV",
          title: "csv",
          url: "https://example.com/rnp.csv",
        },
      ],
      title:
        "Personas declaradas en la conformacion juridica de proveedores en el Registro Nacional de Proveedores",
    },
    {
      id: "awards",
      modifiedAt: "2026-04-05",
      resources: [
        {
          format: "HTML",
          title: "html",
          url: "https://example.com/adjudicacion.html",
        },
      ],
      title: "Datos de la Adjudicacion",
    },
    {
      id: "entities",
      modifiedAt: "2026-04-05",
      resources: [
        {
          format: "data",
          title: "data",
          url: "https://example.com/entidades",
        },
      ],
      title: "Entidades Contratantes",
    },
  ]);

  expect(resources.get("rnp_people")?.format).toBe("csv");
  expect(resources.get("awards")?.sourceUrl).toBe("https://example.com/adjudicacion.html");
  expect(resources.get("contracting_entities")?.format).toBe("data");
});

test("acquireSeaceDatasets loads input-dir fixtures with official-like formats", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "peruvigia-seace-"));

  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("CONOSCE");
    worksheet.addRow([
      "codigoentidad",
      "entidad",
      "tipoprocesoseleccion",
      "proceso",
      "descripcion_item",
      "monto_adjudicado_item_soles",
      "moneda",
      "ruc_proveedor",
      "proveedor",
      "fecha_buenapro",
    ]);
    worksheet.addRow([
      "0001",
      "Municipalidad de Lima",
      "Adjudicación Simplificada",
      "AS-2026-001",
      "Servicio de mantenimiento",
      "125000.50",
      "Soles",
      "20123456789",
      "ACME SAC",
      "05/04/2026",
    ]);

    await writeFile(
      path.join(tempDir, "rnp_people.csv"),
      "FECHA_CORTE|TIPO_DOCUMENTO|NUMERO_DOCUMENTO|NOMBRE_RAZONODENOMINACIONSOCIAL|RUC|TIPO_CONF_JURIDICA\n20260405|DNI|12345678|Ana Perez|20123456789|ACCIONISTA\n",
      "utf8",
    );
    await workbook.xlsx.writeFile(path.join(tempDir, "awards.xlsx"));
    await writeFile(
      path.join(tempDir, "contracting_entities.html"),
      "<html><body><table><tr><td>Municipalidad de Lima</td></tr></table></body></html>",
      "utf8",
    );

    const datasets = await acquireSeaceDatasets({
      inputDir: tempDir,
    });

    expect(datasets).toHaveLength(3);
    expect(datasets.find((dataset) => dataset.kind === "rnp_people")?.records?.[0]).toEqual({
      FECHA_CORTE: "20260405",
      NOMBRE_RAZONODENOMINACIONSOCIAL: "Ana Perez",
      NUMERO_DOCUMENTO: "12345678",
      RUC: "20123456789",
      TIPO_CONF_JURIDICA: "ACCIONISTA",
      TIPO_DOCUMENTO: "DNI",
    });
    expect(datasets.find((dataset) => dataset.kind === "awards")?.records?.[0]).toEqual({
      codigoentidad: "0001",
      descripcion_item: "Servicio de mantenimiento",
      entidad: "Municipalidad de Lima",
      fecha_buenapro: "05/04/2026",
      moneda: "Soles",
      monto_adjudicado_item_soles: "125000.50",
      proceso: "AS-2026-001",
      proveedor: "ACME SAC",
      ruc_proveedor: "20123456789",
      tipoprocesoseleccion: "Adjudicación Simplificada",
    });
    expect(datasets.find((dataset) => dataset.kind === "contracting_entities")?.records).toBeNull();
  } finally {
    await rm(tempDir, {
      force: true,
      recursive: true,
    });
  }
});

test("acquireSeaceDatasets requires the full MVP subset in input-dir mode", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "peruvigia-seace-minimal-"));

  try {
    await writeFile(
      path.join(tempDir, "rnp_people.csv"),
      "Proveedor,Documento,Persona,Rol\nACME SAC,20123456789,Ana Perez,Accionista\n",
      "utf8",
    );

    await expect(
      acquireSeaceDatasets({
        inputDir: tempDir,
      }),
    ).rejects.toThrow("Missing SEACE datasets");
  } finally {
    await rm(tempDir, {
      force: true,
      recursive: true,
    });
  }
});
