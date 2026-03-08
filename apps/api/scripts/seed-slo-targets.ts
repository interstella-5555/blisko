import { db, schema } from "../src/db";

const DEFAULT_SLO_TARGETS: (typeof schema.sloTargets.$inferInsert)[] = [
  // Global targets
  { endpoint: null, metricType: "p95", thresholdMs: 500 },
  { endpoint: null, metricType: "error_rate", thresholdPct: "5" },
  // Per-endpoint targets
  { endpoint: "profiles.me", metricType: "p95", thresholdMs: 200 },
  { endpoint: "profiles.getNearbyUsers", metricType: "p95", thresholdMs: 300 },
  {
    endpoint: "messages.getConversations",
    metricType: "p95",
    thresholdMs: 300,
  },
  { endpoint: "waves.send", metricType: "p95", thresholdMs: 200 },
  { endpoint: "waves.getReceived", metricType: "p95", thresholdMs: 200 },
];

async function main() {
  console.log("Seeding SLO targets...");

  // Upsert: clear existing and insert fresh
  await db.delete(schema.sloTargets);
  await db.insert(schema.sloTargets).values(DEFAULT_SLO_TARGETS);

  console.log(`Inserted ${DEFAULT_SLO_TARGETS.length} SLO targets.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to seed SLO targets:", err);
  process.exit(1);
});
