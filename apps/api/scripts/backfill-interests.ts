/**
 * Backfill script: generates interests for profiles that don't have them.
 * Uses extractInterests() from AI service (requires OPENAI_API_KEY).
 *
 * Run: bun run scripts/backfill-interests.ts
 */

const envPath = `${import.meta.dir}/../.env.local`;
const envFile = await Bun.file(envPath).text().catch(() => '');
const mainEnvPath = `${import.meta.dir}/../.env`;
const mainEnvFile = await Bun.file(mainEnvPath).text().catch(() => '');

const allEnv = mainEnvFile + '\n' + envFile;
const dbUrlMatch = allEnv.match(/DATABASE_URL=(.+)/);
if (!dbUrlMatch) throw new Error('DATABASE_URL not found');

const openaiKeyMatch = allEnv.match(/OPENAI_API_KEY=(.+)/);
if (!openaiKeyMatch) throw new Error('OPENAI_API_KEY not found');
process.env.OPENAI_API_KEY = openaiKeyMatch[1].trim();

const { default: postgres } = await import('postgres');
const sql = postgres(dbUrlMatch[1].trim());

// Import AI service
const { extractInterests } = await import('../src/services/ai');

const profiles = await sql`
  SELECT id, bio, looking_for, social_links
  FROM profiles
  WHERE interests IS NULL
`;

console.log(`Found ${profiles.length} profiles without interests.`);

let processed = 0;
const BATCH_SIZE = 5;

for (let i = 0; i < profiles.length; i += BATCH_SIZE) {
  const batch = profiles.slice(i, i + BATCH_SIZE);

  await Promise.all(
    batch.map(async (profile) => {
      const text = `${profile.bio}\n\n${profile.looking_for}`;
      const interests = await extractInterests(text);

      if (interests.length > 0) {
        const pgArray = '{' + interests.map((i: string) => '"' + i.replace(/"/g, '\\"') + '"').join(',') + '}';
        await sql`
          UPDATE profiles
          SET interests = ${pgArray}::text[]
          WHERE id = ${profile.id}
        `;
      }

      processed++;
      if (processed % 10 === 0) {
        console.log(`  ${processed}/${profiles.length}`);
      }
    })
  );
}

await sql.end();
console.log(`Done! Backfilled interests for ${processed} profiles.`);
