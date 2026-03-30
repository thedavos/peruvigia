import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const emptyJsonb = sql`'{}'::jsonb`;

const createdAtColumn = () =>
  timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull();

const updatedAtColumn = () =>
  timestamp("updated_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull();

const idColumn = (name = "id") =>
  uuid(name)
    .default(sql`gen_random_uuid()`)
    .primaryKey();

// Perfil canonico de la persona investigada. Aqui convergen los hallazgos
// y atributos de identidad que usara el producto como representacion principal.
export const people = pgTable(
  "people",
  {
    id: idColumn(),
    fullName: text("full_name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    documentNumber: text("document_number"),
    currentPosition: text("current_position"),
    institutionName: text("institution_name"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("people_normalized_name_idx").on(table.normalizedName),
    uniqueIndex("people_document_number_unique_idx")
      .on(table.documentNumber)
      .where(sql`${table.documentNumber} is not null`),
  ],
);

// Evidencia cruda o semi-cruda proveniente de una fuente publica. Conserva el
// payload original para trazabilidad, auditoria y reprocesamiento posterior.
export const sourceRecords = pgTable(
  "source_records",
  {
    id: idColumn(),
    sourceType: text("source_type").notNull(),
    sourceCategory: text("source_category"),
    sourceExternalId: text("source_external_id"),
    personId: uuid("person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull(),
    normalizedPayload: jsonb("normalized_payload").$type<Record<string, unknown> | null>(),
    sourceUrl: text("source_url"),
    observedAt: timestamp("observed_at", {
      withTimezone: true,
    }),
    importedAt: timestamp("imported_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("source_records_person_id_idx").on(table.personId),
    index("source_records_source_type_idx").on(table.sourceType),
    uniqueIndex("source_records_source_external_id_unique_idx")
      .on(table.sourceType, table.sourceExternalId)
      .where(sql`${table.sourceExternalId} is not null`),
  ],
);

// Senales derivadas y homogeneas para producto, UI y scoring. Desacoplan la
// app del formato original de cada fuente y guardan su evidencia asociada.
export const signals = pgTable(
  "signals",
  {
    id: idColumn(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, {
        onDelete: "cascade",
      }),
    sourceRecordId: uuid("source_record_id")
      .notNull()
      .references(() => sourceRecords.id, {
        onDelete: "restrict",
      }),
    signalType: text("signal_type").notNull(),
    severity: integer("severity").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default(emptyJsonb).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    detectedAt: timestamp("detected_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("signals_person_id_idx").on(table.personId),
    index("signals_source_record_id_idx").on(table.sourceRecordId),
    index("signals_signal_type_idx").on(table.signalType),
  ],
);

// Organizaciones, empresas o instituciones vinculadas a una persona o
// mencionadas por una fuente. Sirve para cruces y normalizacion de entidades.
export const entities = pgTable(
  "entities",
  {
    id: idColumn(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    entityType: text("entity_type").notNull(),
    externalIdentifier: text("external_identifier"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default(emptyJsonb).notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("entities_normalized_name_idx").on(table.normalizedName),
    uniqueIndex("entities_external_identifier_unique_idx")
      .on(table.entityType, table.externalIdentifier)
      .where(sql`${table.externalIdentifier} is not null`),
  ],
);

// Relacion muchos-a-muchos entre persona y entidad, con tipo de vinculo y
// referencia a la fuente que justifico la asociacion.
export const personEntityLinks = pgTable(
  "person_entity_links",
  {
    id: idColumn(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, {
        onDelete: "cascade",
      }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, {
        onDelete: "cascade",
      }),
    linkType: text("link_type").notNull(),
    sourceRecordId: uuid("source_record_id").references(() => sourceRecords.id, {
      onDelete: "set null",
    }),
    startDate: date("start_date"),
    endDate: date("end_date"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default(emptyJsonb).notNull(),
  },
  (table) => [
    index("person_entity_links_person_id_idx").on(table.personId),
    index("person_entity_links_entity_id_idx").on(table.entityId),
    index("person_entity_links_link_type_idx").on(table.linkType),
  ],
);

// Fotografia versionada del score explicable. Permite recalcular sin perder
// historial ni mezclar el score con los datos crudos.
export const scoreSnapshots = pgTable(
  "score_snapshots",
  {
    id: idColumn(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, {
        onDelete: "cascade",
      }),
    scoreValue: numeric("score_value", {
      precision: 5,
      scale: 2,
      mode: "number",
    }).notNull(),
    scoreLevel: text("score_level").notNull(),
    calculationVersion: text("calculation_version").notNull(),
    factors: jsonb("factors").$type<Record<string, unknown>>().notNull(),
    calculatedAt: timestamp("calculated_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("score_snapshots_person_id_idx").on(table.personId),
    index("score_snapshots_person_calculated_at_idx").on(table.personId, table.calculatedAt),
  ],
);

// Variantes de nombre para busqueda y matching. Ayuda a absorber diferencias
// de escritura sin ensuciar el perfil canonico de la persona.
export const searchAliases = pgTable(
  "search_aliases",
  {
    id: idColumn(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, {
        onDelete: "cascade",
      }),
    alias: text("alias").notNull(),
    normalizedAlias: text("normalized_alias").notNull(),
    sourceRecordId: uuid("source_record_id").references(() => sourceRecords.id, {
      onDelete: "set null",
    }),
    confidence: numeric("confidence", {
      precision: 4,
      scale: 3,
      mode: "number",
    }),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index("search_aliases_person_id_idx").on(table.personId),
    index("search_aliases_normalized_alias_idx").on(table.normalizedAlias),
    uniqueIndex("search_aliases_person_normalized_alias_unique_idx").on(
      table.personId,
      table.normalizedAlias,
    ),
  ],
);

export const schema = {
  people,
  sourceRecords,
  signals,
  entities,
  personEntityLinks,
  scoreSnapshots,
  searchAliases,
};
