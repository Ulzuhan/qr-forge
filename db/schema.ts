import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// QR Codes — admite dos modos:
//  - "dynamic" (default): tiene destinationUrl, el QR apunta a /r/{slug} y redirige
//  - "static": NO redirige, el QR codifica directamente staticPayload (texto/URL/wifi/etc)
export const qrCodes = sqliteTable("qr_codes", {
  id: text("id").primaryKey(), // slug
  type: text("type", { enum: ["dynamic", "static"] })
    .notNull()
    .default("dynamic"),
  // Para dynamic
  destinationUrl: text("destination_url"),
  // Para static — payload literal que se codifica en el QR
  staticPayload: text("static_payload"),
  // Subtipo para static: "url" | "wifi" | "email" | "text"
  staticKind: text("static_kind", { enum: ["url", "wifi", "email", "text"] }),

  title: text("title").notNull(),
  description: text("description"),
  campaign: text("campaign"),

  // Estado
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  expiresAt: integer("expires_at", { mode: "timestamp" }),

  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Scans — solo aplica a dynamic (los static no redirigen)
export const qrScans = sqliteTable("qr_scans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  qrId: text("qr_id")
    .notNull()
    .references(() => qrCodes.id, { onDelete: "cascade" }),
  ip: text("ip"),
  userAgent: text("user_agent"),
  referer: text("referer"),
  country: text("country"),
  scannedAt: integer("scanned_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type QrCode = typeof qrCodes.$inferSelect;
export type NewQrCode = typeof qrCodes.$inferInsert;
export type QrScan = typeof qrScans.$inferSelect;
export type NewQrScan = typeof qrScans.$inferInsert;
