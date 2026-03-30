CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"entity_type" text NOT NULL,
	"external_identifier" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"document_number" text,
	"current_position" text,
	"institution_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_entity_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"link_type" text NOT NULL,
	"source_record_id" uuid,
	"start_date" date,
	"end_date" date,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"score_value" numeric(5, 2) NOT NULL,
	"score_level" text NOT NULL,
	"calculation_version" text NOT NULL,
	"factors" jsonb NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"normalized_alias" text NOT NULL,
	"source_record_id" uuid,
	"confidence" numeric(4, 3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"source_record_id" uuid NOT NULL,
	"signal_type" text NOT NULL,
	"severity" integer NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" text NOT NULL,
	"source_category" text,
	"source_external_id" text,
	"person_id" uuid,
	"raw_payload" jsonb NOT NULL,
	"normalized_payload" jsonb,
	"source_url" text,
	"observed_at" timestamp with time zone,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "person_entity_links" ADD CONSTRAINT "person_entity_links_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_entity_links" ADD CONSTRAINT "person_entity_links_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_entity_links" ADD CONSTRAINT "person_entity_links_source_record_id_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."source_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_snapshots" ADD CONSTRAINT "score_snapshots_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_aliases" ADD CONSTRAINT "search_aliases_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_aliases" ADD CONSTRAINT "search_aliases_source_record_id_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."source_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_source_record_id_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."source_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_records" ADD CONSTRAINT "source_records_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entities_normalized_name_idx" ON "entities" USING btree ("normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "entities_external_identifier_unique_idx" ON "entities" USING btree ("entity_type","external_identifier") WHERE "entities"."external_identifier" is not null;--> statement-breakpoint
CREATE INDEX "people_normalized_name_idx" ON "people" USING btree ("normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "people_document_number_unique_idx" ON "people" USING btree ("document_number") WHERE "people"."document_number" is not null;--> statement-breakpoint
CREATE INDEX "person_entity_links_person_id_idx" ON "person_entity_links" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "person_entity_links_entity_id_idx" ON "person_entity_links" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "person_entity_links_link_type_idx" ON "person_entity_links" USING btree ("link_type");--> statement-breakpoint
CREATE INDEX "score_snapshots_person_id_idx" ON "score_snapshots" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "score_snapshots_person_calculated_at_idx" ON "score_snapshots" USING btree ("person_id","calculated_at");--> statement-breakpoint
CREATE INDEX "search_aliases_person_id_idx" ON "search_aliases" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "search_aliases_normalized_alias_idx" ON "search_aliases" USING btree ("normalized_alias");--> statement-breakpoint
CREATE UNIQUE INDEX "search_aliases_person_normalized_alias_unique_idx" ON "search_aliases" USING btree ("person_id","normalized_alias");--> statement-breakpoint
CREATE INDEX "signals_person_id_idx" ON "signals" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "signals_source_record_id_idx" ON "signals" USING btree ("source_record_id");--> statement-breakpoint
CREATE INDEX "signals_signal_type_idx" ON "signals" USING btree ("signal_type");--> statement-breakpoint
CREATE INDEX "source_records_person_id_idx" ON "source_records" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "source_records_source_type_idx" ON "source_records" USING btree ("source_type");--> statement-breakpoint
CREATE UNIQUE INDEX "source_records_source_external_id_unique_idx" ON "source_records" USING btree ("source_type","source_external_id") WHERE "source_records"."source_external_id" is not null;
--> statement-breakpoint
COMMENT ON TABLE "people" IS 'Perfil canonico de la persona investigada dentro del MVP.';
--> statement-breakpoint
COMMENT ON TABLE "source_records" IS 'Evidencia cruda o semi-cruda importada desde fuentes publicas para trazabilidad.';
--> statement-breakpoint
COMMENT ON TABLE "signals" IS 'Senales derivadas y homogeneas usadas por producto, UI y scoring.';
--> statement-breakpoint
COMMENT ON TABLE "entities" IS 'Organizaciones, empresas o instituciones relacionadas con una persona o una fuente.';
--> statement-breakpoint
COMMENT ON TABLE "person_entity_links" IS 'Vinculos entre personas y entidades con trazabilidad a la fuente de origen.';
--> statement-breakpoint
COMMENT ON TABLE "score_snapshots" IS 'Fotografias versionadas del score explicable calculado para una persona.';
--> statement-breakpoint
COMMENT ON TABLE "search_aliases" IS 'Variantes de nombre para mejorar busqueda y matching de personas.';
--> statement-breakpoint
COMMENT ON COLUMN "source_records"."raw_payload" IS 'Payload original recibido desde la fuente oficial.';
--> statement-breakpoint
COMMENT ON COLUMN "source_records"."normalized_payload" IS 'Version normalizada del payload crudo para procesos internos.';
--> statement-breakpoint
COMMENT ON COLUMN "signals"."metadata" IS 'Contexto estructurado adicional para explicar la senal y su evidencia.';
--> statement-breakpoint
COMMENT ON COLUMN "entities"."metadata" IS 'Metadata flexible para atributos adicionales de la entidad.';
--> statement-breakpoint
COMMENT ON COLUMN "person_entity_links"."metadata" IS 'Metadata flexible del vinculo entre persona y entidad.';
--> statement-breakpoint
COMMENT ON COLUMN "score_snapshots"."factors" IS 'Factores estructurados que explican como se calculo el score.';
--> statement-breakpoint
COMMENT ON COLUMN "score_snapshots"."calculation_version" IS 'Version de reglas o algoritmo usada para calcular el score.';
