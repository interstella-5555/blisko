import { createDb } from "@repo/db";

const { db } = createDb({
  connectionString: process.env.DATABASE_URL!,
  max: 3,
});

export { schema } from "@repo/db";
export { db };
