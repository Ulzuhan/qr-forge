import Database from "better-sqlite3";
import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const dbPath = resolve(process.env.QRFORGE_DB_PATH ?? "./qrforge.db");
mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
chmodSync(dirname(dbPath), 0o700);
if (!existsSync(dbPath)) {
  mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  db.exec(readFileSync(new URL("./esquema.sql", import.meta.url), "utf8"));
  db.close();
  chmodSync(dbPath, 0o600);
}
