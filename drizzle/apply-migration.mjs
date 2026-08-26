// Helper para resetear la DB y aplicar migrations
// Uso: npm run db:reset
//
// En .mjs y con imports: el proyecto no declara "type": "module", así que un
// .js aquí es CommonJS y `require()` funcionaba — pero el lint de TypeScript
// se aplica también a los .js del repo y lo marcaba como error. Convertirlo es
// más honesto que silenciar la regla.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dbPath = path.join(import.meta.dirname, "..", "qrforge.db");
const dbWal = dbPath + "-wal";
const dbShm = dbPath + "-shm";

if (fs.existsSync(dbPath)) {
  fs.rmSync(dbPath);
  console.log("✓ Removed old DB");
}
if (fs.existsSync(dbWal)) {
  fs.rmSync(dbWal);
  console.log("✓ Removed WAL");
}
if (fs.existsSync(dbShm)) {
  fs.rmSync(dbShm);
  console.log("✓ Removed SHM");
}

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Encontrar todos los archivos de migration
const drizzleDir = import.meta.dirname;
const migrations = fs
  .readdirSync(drizzleDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

console.log(`Applying ${migrations.length} migration(s)...`);

for (const file of migrations) {
  const sql = fs.readFileSync(path.join(drizzleDir, file), "utf-8");
  const statements = sql.split("--> statement-breakpoint");
  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (trimmed) db.exec(trimmed);
  }
  console.log(`  ✓ ${file}`);
}

console.log("✓ Schema applied successfully");
db.close();
