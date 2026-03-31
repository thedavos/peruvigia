import { normalizeDjiDatasets } from "./normalize.js";
import type { DjiDownloadedDataset } from "./types.js";

function createDataset(
  kind: DjiDownloadedDataset["kind"],
  rows: DjiDownloadedDataset["rows"],
): DjiDownloadedDataset {
  return {
    format: "json",
    kind,
    modifiedAt: "2026-03-31",
    rows,
    sourceUrl: `https://example.com/${kind}.json`,
    title: kind,
  };
}

test("normalizeDjiDatasets aggregates declaration context into entity and person links", () => {
  const result = normalizeDjiDatasets([
    createDataset("declarations", [
      {
        "ID Declaracion": "DECL-1",
        DNI: "12345678",
        "Apellidos y Nombres": "Juana Perez",
        Cargo: "Gerente Publica",
        Entidad: "Municipalidad de Lima",
        "Fecha de Declaracion": "2026-03-30",
      },
    ]),
    createDataset("employment", [
      {
        "ID Declaracion": "DECL-1",
        Entidad: "Municipalidad de Lima",
        Cargo: "Gerente Publica",
        "Fecha Inicio": "2024-01-01",
      },
    ]),
    createDataset("commercial", [
      {
        "ID Declaracion": "DECL-1",
        Empresa: "Acme SAC",
        Participacion: "Accionista",
      },
    ]),
    createDataset("family", [
      {
        "ID Declaracion": "DECL-1",
        Familiar: "Carlos Perez",
        Parentesco: "Hermano",
      },
      {
        "ID Declaracion": "DECL-X",
        Familiar: "Orfano Perez",
        Parentesco: "Primo",
      },
    ]),
    createDataset("guild", [
      {
        "ID Declaracion": "DECL-1",
        Gremio: "Colegio de Ingenieros",
        Rol: "Miembro",
      },
    ]),
    createDataset("board_membership", [
      {
        "ID Declaracion": "DECL-1",
        "Organo Colegiado": "Directorio de Example",
        Rol: "Director",
      },
    ]),
  ]);

  expect(result.declarations).toHaveLength(1);
  expect(result.errors).toContain("Orphan family row without matching declaration: DECL-X");
  expect(result.skipped).toBeGreaterThanOrEqual(1);

  const [declaration] = result.declarations;
  expect(declaration?.declarationExternalId).toBe("DECL-1");
  expect(declaration?.entityLinks).toHaveLength(4);
  expect(declaration?.entityLinks.map((link) => link.linkType)).toEqual(
    expect.arrayContaining(["employment", "commercial", "guild", "board_membership"]),
  );
  expect(declaration?.personLinks).toHaveLength(1);
  expect(declaration?.personLinks[0]?.linkType).toBe("family");
  expect(declaration?.personLinks[0]?.detail).toContain("Hermano");
});
