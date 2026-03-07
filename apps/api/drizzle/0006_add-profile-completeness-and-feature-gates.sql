CREATE TABLE "feature_gates" (
	"feature" text PRIMARY KEY NOT NULL,
	"requires" text[] NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "is_complete" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE profiles SET is_complete = true WHERE bio != '' AND looking_for != '' AND embedding IS NOT NULL;
--> statement-breakpoint
INSERT INTO feature_gates (feature, requires) VALUES
  ('waves.send', '{isComplete}'),
  ('waves.respond', '{isComplete}'),
  ('groups.create', '{isComplete}'),
  ('groups.joinDiscoverable', '{isComplete}');