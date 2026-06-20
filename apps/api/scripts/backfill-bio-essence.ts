/**
 * Backfill: generate dual-language (PL + UA) bio essence for complete profiles
 * that don't have one yet. Mirrors the bio_essence step of
 * processGenerateProfileAI — canonical on profiles.bio_essence, the other locale
 * on profile_translations. Idempotent (only touches rows where bio_essence IS
 * NULL), so it's safe to re-run after an interruption. BLI-304.
 *
 * Requires the bio_essence column to already exist — run AFTER the migration has
 * deployed (Railway post-deploy hook), never before.
 *
 * Local DB:  bun run apps/api/scripts/backfill-bio-essence.ts
 * Prod DB:   bun --env-file=apps/api/.env.production run apps/api/scripts/backfill-bio-essence.ts
 */

import { AI_MODELS, type LocaleCode } from "@repo/shared";
import { and, eq, isNull, ne } from "drizzle-orm";
import { db, schema } from "../src/db";
import { generateBioEssence } from "../src/services/ai";
import type { AiLogCtx } from "../src/services/ai-log";
import { upsertTranslation } from "../src/services/profile-translations";

const BATCH_SIZE = 5;

const rows = await db.query.profiles.findMany({
  where: and(isNull(schema.profiles.bioEssence), eq(schema.profiles.isComplete, true), ne(schema.profiles.bio, "")),
  columns: { userId: true, bio: true, contentLocale: true },
});

console.log(`Found ${rows.length} complete profiles without bio essence.`);

let processed = 0;

for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batch = rows.slice(i, i + BATCH_SIZE);

  await Promise.all(
    batch.map(async (p) => {
      if (!p.bio?.trim()) return;

      const ctx: AiLogCtx = {
        jobName: "generate-profile-ai",
        userId: p.userId,
        model: AI_MODELS.async,
        serviceTier: "flex",
        reasoningEffort: "minimal",
      };

      const dual = await generateBioEssence(p.bio, p.contentLocale, ctx);
      const canonical = p.contentLocale === "ua" ? dual.ua : dual.pl;
      const nonCanonical = p.contentLocale === "ua" ? dual.pl : dual.ua;
      const nonCanonicalLocale: LocaleCode = p.contentLocale === "ua" ? "pl" : "ua";

      await db.transaction(async (tx) => {
        await tx
          .update(schema.profiles)
          .set({ bioEssence: canonical, updatedAt: new Date() })
          .where(eq(schema.profiles.userId, p.userId));
        await tx
          .delete(schema.profileTranslations)
          .where(
            and(eq(schema.profileTranslations.userId, p.userId), eq(schema.profileTranslations.field, "bio_essence")),
          );
        if (nonCanonical && nonCanonical !== canonical) {
          await upsertTranslation(p.userId, "bio_essence", nonCanonicalLocale, nonCanonical, tx);
        }
      });

      processed++;
      if (processed % 10 === 0) console.log(`  ${processed}/${rows.length}`);
    }),
  );
}

console.log(`Done! Backfilled bio essence for ${processed} profiles.`);
process.exit(0);
