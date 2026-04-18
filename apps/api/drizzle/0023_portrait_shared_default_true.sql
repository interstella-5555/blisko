-- 0023_portrait_shared_default_true — flaga nie miała efektu funkcjonalnego
--
-- portraitSharedForMatching było togglem w UI który nic nie robił —
-- matching zawsze używa portretu jeśli istnieje. Usuwamy sekcję portretu
-- z UI (portret jest "never shown to user" per ai-profiling.md), flaga
-- zostaje jako audit / przyszła kontrola zgody. Default → true, backfill
-- istniejących false → true. BLI-199.

ALTER TABLE "profiles" ALTER COLUMN "portrait_shared_for_matching" SET DEFAULT true;--> statement-breakpoint
UPDATE "profiles" SET "portrait_shared_for_matching" = true WHERE "portrait_shared_for_matching" = false;
