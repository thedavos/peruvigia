import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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

test("acquireSeaceDatasets loads input-dir fixtures and parses structured formats", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "peruvigia-seace-"));

  try {
    await writeFile(
      path.join(tempDir, "rnp_people.csv"),
      "Proveedor,Documento,Persona,Rol\nACME SAC,20123456789,Ana Perez,Accionista\n",
      "utf8",
    );
    await writeFile(
      path.join(tempDir, "awards.json"),
      JSON.stringify([
        {
          entidad: "Municipalidad de Lima",
          monto: 125000,
          proveedor: "ACME SAC",
        },
      ]),
      "utf8",
    );
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
      Documento: "20123456789",
      Persona: "Ana Perez",
      Proveedor: "ACME SAC",
      Rol: "Accionista",
    });
    expect(datasets.find((dataset) => dataset.kind === "awards")?.records?.[0]).toEqual({
      entidad: "Municipalidad de Lima",
      monto: 125000,
      proveedor: "ACME SAC",
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
