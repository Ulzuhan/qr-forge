import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

// Singleton pattern para evitar múltiples conexiones en dev (HMR)
const globalForDb = globalThis as unknown as {
  __qrforge_db__?: Database.Database;
};

const sqlite =
  globalForDb.__qrforge_db__ ??
  new Database(process.env.QRFORGE_DB_PATH ?? "./qrforge.db");

if (process.env.NODE_ENV !== "production") {
  globalForDb.__qrforge_db__ = sqlite;
}

// Habilitar WAL mode para mejor rendimiento en escrituras concurrentes
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { schema };
