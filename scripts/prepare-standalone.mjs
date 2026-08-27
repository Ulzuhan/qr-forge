import { cpSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
const root = join(import.meta.dirname, "..", ".next", "standalone");
for (const entry of ["qrforge.db", "qrforge.db-wal", "qrforge.db-shm", ".env", ".env.local"]) {
  rmSync(join(root, entry), { force: true });
}
cpSync(join(root, "..", "static"), join(root, ".next", "static"), { recursive: true });
if (existsSync(join(root, "..", "..", "public"))) cpSync(join(root, "..", "..", "public"), join(root, "public"), { recursive: true });
