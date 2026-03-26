import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export { schema };
export { preparedName } from "./prepare";

interface CreateDbOptions {
  connectionString: string;
  max?: number;
}

export function createDb({ connectionString, max }: CreateDbOptions) {
  const client = postgres(connectionString, { max });
  const db = drizzle(client, { schema });
  return { db, client };
}
