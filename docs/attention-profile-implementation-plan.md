# Plan tecnico para VIG-11

## Objetivo

Construir un motor unificado que pase de evidencia por fuente a un perfil de atencion publica por persona, con:

1. matching reproducible entre persona, alias y entidades relacionadas
2. señales derivadas homogéneas y explicables
3. score determinístico versionado
4. snapshot persistido en `score_snapshots`
5. respuesta lista para UI e IA

## Estado actual

- El esquema ya soporta `signals`, `person_entity_links`, `person_person_links`, `score_snapshots` y `search_aliases`.
- DJI ya persiste contexto declarativo en `person_entity_links` y `person_person_links`.
- Contraloria ya persiste señales en `signals`.
- SEACE ya persiste:
  - entidades proveedoras y contratantes en `entities`
  - relación persona -> proveedor en `person_entity_links` con `linkType = "supplier_relationship"`
  - actividad contractual en `source_records` con `sourceCategory = "awards"`
- No existe todavía:
  - motor de matching transversal
  - derivación homogénea de señales DJI + Contraloria + SEACE
  - uso real de `score_snapshots`
  - uso real de `search_aliases`
  - endpoint `GET /people/:personId/attention-profile`

## Principios de dominio

- El contexto declarativo no es penalizable por si solo.
- Un vínculo DJI solo aporta contexto y evidencia de cruce.
- La penalización aparece cuando existe una condición derivada verificable:
  - sanción vigente
  - coincidencia contractual relevante con entidad declarada
  - coincidencia contractual relevante con proveedor vinculado
- El score debe ser determinístico:
  - misma evidencia + misma versión de cálculo = mismo snapshot lógico
- Toda razón del score debe apuntar a evidencia concreta.

## Propuesta de arquitectura

### Nuevos archivos

- `apps/api/src/modules/attention/types.ts`
- `apps/api/src/modules/attention/match.ts`
- `apps/api/src/modules/attention/signals.ts`
- `apps/api/src/modules/attention/score.ts`
- `apps/api/src/modules/attention/repository.ts`
- `apps/api/src/modules/attention/service.ts`
- `apps/api/src/routes/attention.ts`
- `apps/api/src/routes/attention.test.ts`
- `packages/shared/src/attention.ts`

### Archivos a actualizar

- `packages/shared/src/index.ts`
- `apps/api/src/app.ts`
- `apps/api/src/modules/dji/service.ts`
- `apps/api/src/modules/contraloria/service.ts`
- `apps/api/src/modules/seace/service.ts`
- `apps/api/package.json`

## Responsabilidad por archivo

### `apps/api/src/modules/attention/types.ts`

Definir tipos internos del motor:

- `AttentionProfileInput`
- `AttentionEvidenceRef`
- `DerivedAttentionSignal`
- `AttentionFactor`
- `AttentionScoreBreakdown`
- `AttentionProfileResult`
- `AttentionCalculationVersion`

### `apps/api/src/modules/attention/match.ts`

Resolver matching y canonización a partir de la persona objetivo:

- documento exacto desde `people.document_number`
- aliases desde `search_aliases`
- aliases derivados desde nombres vistos en `source_records.normalized_payload`
- entidades relacionadas por `person_entity_links`
- personas relacionadas por `person_person_links`
- proveedores relacionados via SEACE:
  - `supplier_relationship`
  - `entities.external_identifier`
- entidades contratantes relacionadas via awards SEACE

Este archivo no calcula score. Solo devuelve un grafo de coincidencias con evidencia.

### `apps/api/src/modules/attention/signals.ts`

Derivar señales homogéneas en dos grupos:

- contextuales
- penalizables

Señales iniciales recomendadas:

- `contraloria_sanction_active`
- `contraloria_sanction_historical`
- `dji_declared_commercial_link_context`
- `dji_declared_family_link_context`
- `dji_declared_board_link_context`
- `supplier_relationship_context`
- `commercial_match_with_declared_entity`
- `supplier_match_with_declared_provider`
- `contracting_activity_with_related_supplier`

Reglas:

- Las señales `*_context` tienen peso `0`.
- `commercial_match_with_declared_entity` existe cuando una entidad declarada en DJI reaparece como entidad proveedora o contraparte contractual con evidencia SEACE.
- `supplier_match_with_declared_provider` existe cuando una persona tiene vínculo `supplier_relationship` y ese proveedor aparece en adjudicaciones SEACE.
- `contracting_activity_with_related_supplier` resume actividad contractual del proveedor relacionado y aporta magnitud explicable.

### `apps/api/src/modules/attention/score.ts`

Contener la política de scoring pura y versionada.

Constantes iniciales recomendadas:

- `ATTENTION_SCORE_VERSION = "attention_v1"`

Pesos iniciales recomendados:

- `contraloria_sanction_active`: `70`
- `contraloria_sanction_historical`: `15`
- `commercial_match_with_declared_entity`: `12`
- `supplier_match_with_declared_provider`: `10`
- `contracting_activity_with_related_supplier`: `8`
- señales contextuales: `0`

Reglas del score:

- sumar pesos por factor único
- evitar doble conteo por la misma evidencia canónica
- cap en `100`
- mapear nivel:
  - `0-19`: `low`
  - `20-49`: `medium`
  - `50-79`: `high`
  - `80-100`: `critical`

El resultado debe incluir:

- score numérico
- nivel
- factores ordenados por impacto
- razones resumidas
- evidencia por factor

### `apps/api/src/modules/attention/repository.ts`

Persistir y leer:

- aliases canonizados en `search_aliases`
- snapshot actual en `score_snapshots`

Funciones recomendadas:

- `upsertSearchAliasesForPerson(...)`
- `insertScoreSnapshot(...)`
- `getLatestScoreSnapshot(personId, version?)`

No borrar historial de `score_snapshots`.

### `apps/api/src/modules/attention/service.ts`

Orquestar el flujo completo:

1. validar existencia de persona
2. recolectar contexto fuente
3. ejecutar matching
4. derivar señales homogéneas
5. calcular score
6. persistir aliases y snapshot
7. devolver payload listo para UI e IA

Funciones recomendadas:

- `getAttentionProfile(personId, options?)`
- `recalculateAttentionProfile(personId, options?)`
- `recalculateAttentionProfiles(personIds, options?)`

## Contrato compartido para UI e IA

Crear en `packages/shared/src/attention.ts` un contrato explícito.

### Respuesta propuesta

```ts
type AttentionProfileResponse = {
  personId: string;
  calculationVersion: string;
  calculatedAt: string;
  score: {
    value: number;
    level: "low" | "medium" | "high" | "critical";
    summary: string;
  };
  reasons: Array<{
    key: string;
    label: string;
    impact: "context" | "low" | "medium" | "high";
    weight: number;
    summary: string;
  }>;
  factors: Array<{
    key: string;
    weight: number;
    contribution: number;
    isPenalizable: boolean;
    evidence: Array<{
      sourceType: string;
      sourceRecordId: string;
      sourceExternalId: string | null;
      sourceUrl: string | null;
      observedAt: string | null;
      detail: string;
    }>;
    metadata: Record<string, unknown>;
  }>;
  context: {
    aliases: string[];
    entityLinksCount: number;
    personLinksCount: number;
    relatedSuppliersCount: number;
    awardsCount: number;
    activeSanctionsCount: number;
  };
};
```

### Endpoint

- `GET /people/:personId/attention-profile`

Semántica:

- `200` devuelve el perfil calculado
- `404` si la persona no existe

## Persistencia propuesta

### `search_aliases`

Insertar aliases con confianza y fuente:

- nombre canónico de `people.full_name`
- nombre normalizado observado en Contraloria
- variantes observadas en DJI
- variantes observadas en SEACE RNP

No crear aliases vacíos ni duplicados por `normalized_alias`.

### `score_snapshots.factors`

Guardar un objeto autocontenido, estable y legible:

```json
{
  "version": "attention_v1",
  "score": 82,
  "level": "critical",
  "weights": {
    "contraloria_sanction_active": 70,
    "supplier_match_with_declared_provider": 10
  },
  "factors": [
    {
      "key": "contraloria_sanction_active",
      "contribution": 70,
      "evidenceCount": 1,
      "canonicalEvidenceKeys": [
        "contraloria:ley_31288:dni:12345678:res:abc-2026:type:inhabilitacion"
      ]
    }
  ],
  "reasonSummary": [
    "Tiene una sanción activa en Contraloría",
    "Existe actividad contractual de un proveedor relacionado"
  ]
}
```

La UI y la IA no deberían tener que reinterpretar `signals` crudas para explicar el score.

## Matching mínimo viable

### Prioridad de matching

1. documento exacto
2. `search_aliases.normalized_alias`
3. nombre normalizado único en `people`
4. cruce por entidad relacionada
5. cruce por proveedor relacionado en SEACE

### Reglas concretas

- Si hay documento, ese match gana siempre.
- Match por nombre solo si produce una persona única.
- Si un nombre coincide con varias personas y no hay documento, no unificar automáticamente.
- Un `supplier_relationship` conecta persona -> proveedor, no implica riesgo por si solo.
- Una coincidencia SEACE se vuelve señal penalizable solo cuando tiene:
  - proveedor o entidad concreta
  - evidencia verificable en `source_records`
  - regla derivada definida en `signals.ts`

## Recalculo tras syncs

Implementar un punto único:

- `recalculateAttentionProfiles(personIds)`

Integración recomendada:

- `runDjiSync(...)` recalcula para personas declarantes tocadas
- `runContraloriaSync(...)` recalcula para personas tocadas
- `runSeaceSync(...)` recalcula para personas con:
  - nuevos `supplier_relationship`
  - nueva actividad contractual de proveedores relacionados

Cambio sugerido en repositorios de ingestión:

- devolver `affectedPersonIds: string[]` además de `summary` y `errors`

Esto evita queries difusas posteriores y mantiene el recálculo reproducible.

## Orden de desarrollo

### Fase 1

Crear contrato compartido y endpoint stub:

- `packages/shared/src/attention.ts`
- `apps/api/src/routes/attention.ts`
- `apps/api/src/routes/attention.test.ts`
- wiring en `apps/api/src/app.ts`

Resultado esperado:

- endpoint nuevo estable para frontend
- tests de contrato pasando

### Fase 2

Implementar `modules/attention/service.ts` con lectura agregada, sin persistencia todavía.

Resultado esperado:

- respuesta calculada en memoria
- sin tocar ingestión existente

### Fase 3

Implementar `match.ts` y `signals.ts`.

Resultado esperado:

- señales homogéneas reproducibles
- separación clara entre contexto y señal penalizable

### Fase 4

Implementar `score.ts` y persistencia en `score_snapshots`.

Resultado esperado:

- score determinístico versionado
- snapshot listo para auditoría y replay

### Fase 5

Persistir aliases en `search_aliases`.

Resultado esperado:

- matching menos frágil por variaciones de nombre

### Fase 6

Propagar `affectedPersonIds` desde syncs y ejecutar recálculo post-sync.

Resultado esperado:

- snapshots al día tras nuevas importaciones

## Plan de pruebas

### Unitarias

- matching por documento
- matching por alias único
- no unificar por nombre ambiguo
- no penalizar vínculo DJI por sí solo
- deduplicar evidencia para no duplicar score
- score reproducible con mismo input

### Integración API

- `GET /people/:personId/attention-profile` devuelve shape esperado
- `404` para persona inexistente
- el resumen incluye razones y evidencia

### Integración dominio

Caso recomendado de fixture:

1. persona con vínculo DJI comercial a proveedor
2. SEACE con proveedor adjudicado
3. Contraloria con y sin sanción activa

Verificar:

- contexto aparece siempre
- score cambia solo con señales penalizables
- snapshot persistido contiene versión, factores y razones

## Riesgos y decisiones

- Match por nombre ambiguo es el principal riesgo de falsos positivos.
- No conviene reusar directamente `signals` actuales de Contraloria como payload final de UI; es mejor transformarlas a un contrato unificado.
- El peso inicial debe vivir en código versionado, no en base de datos, para mantener reproducibilidad en MVP.
- `score_snapshots` debe guardar resumen ya digerido para evitar recalcular explicación en cada lectura.

## Recomendacion de implementacion inmediata

Empezar por Fase 1 y Fase 2 en un mismo PR:

- contrato compartido
- nueva ruta
- servicio agregador básico
- score y razones en memoria

Eso deja a frontend y IA integrarse temprano, y después permite endurecer matching, aliases y recálculo post-sync sin romper el endpoint.
