import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { acquireDjiDatasets, resolveDjiResourcesFromCatalog } from "./source";

test("resolveDjiResourcesFromCatalog picks the preferred format per dataset kind", () => {
  const resources = resolveDjiResourcesFromCatalog([
    {
      id: "decl",
      modifiedAt: "2026-03-31",
      resources: [
        {
          format: "CSV",
          title: "csv",
          url: "https://example.com/declarations.csv",
        },
        {
          format: "JSON",
          title: "json",
          url: "https://example.com/declarations.json",
        },
      ],
      title: "Listado de declaraciones juradas de intereses",
    },
    {
      id: "employment",
      modifiedAt: "2026-03-31",
      resources: [
        {
          format: "XML",
          title: "xml",
          url: "https://example.com/employment.xml",
        },
      ],
      title: "Listado de empleos de los declarantes",
    },
    {
      id: "family",
      modifiedAt: "2026-03-31",
      resources: [
        {
          format: "CSV",
          title: "csv",
          url: "https://example.com/family.csv",
        },
      ],
      title: "Listado de familiares de los declarantes",
    },
    {
      id: "commercial",
      modifiedAt: "2026-03-31",
      resources: [
        {
          format: "JSON",
          title: "json",
          url: "https://example.com/commercial.json",
        },
      ],
      title: "Listado de empresas y sociedades declaradas",
    },
    {
      id: "guild",
      modifiedAt: "2026-03-31",
      resources: [
        {
          format: "JSON",
          title: "json",
          url: "https://example.com/guild.json",
        },
      ],
      title: "Listado de gremios declarados",
    },
    {
      id: "board",
      modifiedAt: "2026-03-31",
      resources: [
        {
          format: "JSON",
          title: "json",
          url: "https://example.com/board.json",
        },
      ],
      title: "Listado de organos colegiados declarados",
    },
  ]);

  expect(resources.get("declarations")?.format).toBe("json");
  expect(resources.get("employment")?.format).toBe("xml");
  expect(resources.get("family")?.format).toBe("csv");
  expect(resources.get("commercial")?.sourceUrl).toBe("https://example.com/commercial.json");
});

test("acquireDjiDatasets loads input-dir fixtures across json csv and xml", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "peruvigia-dji-"));

  try {
    await writeFile(
      path.join(tempDir, "declarations.json"),
      JSON.stringify([
        {
          "ID Declaracion": "DECL-1",
          DNI: "12345678",
          "Apellidos y Nombres": "Juana Perez",
        },
      ]),
      "utf8",
    );
    await writeFile(
      path.join(tempDir, "employment.csv"),
      "ID Declaracion,DNI,Entidad,Cargo\nDECL-1,12345678,Municipalidad de Lima,Gerente\n",
      "utf8",
    );
    await writeFile(
      path.join(tempDir, "commercial.xml"),
      "<rows><row><id_declaracion>DECL-1</id_declaracion><Empresa>Acme SAC</Empresa></row></rows>",
      "utf8",
    );
    await writeFile(
      path.join(tempDir, "family.json"),
      JSON.stringify([
        {
          "ID Declaracion": "DECL-1",
          Familiar: "Carlos Perez",
          Parentesco: "Hermano",
        },
      ]),
      "utf8",
    );
    await writeFile(
      path.join(tempDir, "guild.json"),
      JSON.stringify([
        {
          "ID Declaracion": "DECL-1",
          Gremio: "Colegio de Ingenieros",
        },
      ]),
      "utf8",
    );
    await writeFile(
      path.join(tempDir, "board_membership.json"),
      JSON.stringify([
        {
          "ID Declaracion": "DECL-1",
          "Organo Colegiado": "Directorio de Example",
        },
      ]),
      "utf8",
    );

    const datasets = await acquireDjiDatasets({
      inputDir: tempDir,
    });

    expect(datasets).toHaveLength(6);
    expect(datasets.find((dataset) => dataset.kind === "employment")?.rows[0]).toEqual({
      Cargo: "Gerente",
      DNI: "12345678",
      Entidad: "Municipalidad de Lima",
      "ID Declaracion": "DECL-1",
    });
    expect(datasets.find((dataset) => dataset.kind === "commercial")?.rows[0]).toEqual({
      Empresa: "Acme SAC",
      id_declaracion: "DECL-1",
    });
  } finally {
    await rm(tempDir, {
      force: true,
      recursive: true,
    });
  }
});

test("acquireDjiDatasets only requires declarations when running from input-dir", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "peruvigia-dji-minimal-"));

  try {
    await writeFile(
      path.join(tempDir, "declarations.json"),
      JSON.stringify([
        {
          "ID Declaracion": "DECL-1",
          DNI: "12345678",
          "Apellidos y Nombres": "Juana Perez",
        },
      ]),
      "utf8",
    );

    const datasets = await acquireDjiDatasets({
      inputDir: tempDir,
    });

    expect(datasets).toHaveLength(1);
    expect(datasets[0]?.kind).toBe("declarations");
  } finally {
    await rm(tempDir, {
      force: true,
      recursive: true,
    });
  }
});
