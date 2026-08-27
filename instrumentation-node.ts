import { lt } from "drizzle-orm";
import { db } from "@/db";
import { qrScans, sessions } from "@/db/schema";
import { positiveInt } from "@/lib/request-security";

async function cleanup() {
  const now = new Date();
  const retentionDays = positiveInt("QRFORGE_SCAN_RETENTION_DAYS", 365, 3650);
  try {
    await db.delete(sessions).where(lt(sessions.expiresAt, now));
    await db.delete(qrScans).where(lt(qrScans.scannedAt, new Date(now.getTime() - retentionDays * 86_400_000)));
  } catch (error) {
    console.error("[retention cleanup]", error);
  }
}

void cleanup();
const timer = setInterval(() => void cleanup(), 6 * 60 * 60 * 1000);
timer.unref();
