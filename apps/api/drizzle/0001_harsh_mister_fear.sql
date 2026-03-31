CREATE TABLE "person_person_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"related_person_id" uuid NOT NULL,
	"link_type" text NOT NULL,
	"source_record_id" uuid,
	"start_date" date,
	"end_date" date,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "person_person_links" ADD CONSTRAINT "person_person_links_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_person_links" ADD CONSTRAINT "person_person_links_related_person_id_people_id_fk" FOREIGN KEY ("related_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_person_links" ADD CONSTRAINT "person_person_links_source_record_id_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."source_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "person_person_links_person_id_idx" ON "person_person_links" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "person_person_links_related_person_id_idx" ON "person_person_links" USING btree ("related_person_id");--> statement-breakpoint
CREATE INDEX "person_person_links_link_type_idx" ON "person_person_links" USING btree ("link_type");