import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

// Usuarios — espejo local de la identidad que gestiona Authentik.
//
// No hay contraseñas ni estados de aprobación: eso vive en el proveedor de
// identidad, que solo emite tokens para quien esté en el grupo de esta
// aplicación. Aquí solo se guarda lo justo para poder decir "este QR es de
// esta persona" y para enseñar quién ha iniciado sesión.
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  /**
   * El identificador estable que da Authentik (claim `sub`). La identidad es
   * esto y no el email: alguien puede cambiar de correo y seguir siendo el
   * mismo dueño de sus QRs.
   */
  oidcSub: text("oidc_sub").notNull().unique(),
  email: text("email").notNull(),
  name: text("name"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Sesiones — con estado en DB (no cookie firmada) para poder revocarlas:
// cerrar sesión, o echar a todo el mundo borrando filas.
export const sessions = sqliteTable(
  "sessions",
  {
    // SHA-256 del token que viaja en la cookie, no el token: si alguien lee la
    // DB no se lleva credenciales utilizables.
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("sessions_user_idx").on(table.userId)]
);

// QR Codes — admite dos modos:
//  - "dynamic" (default): tiene destinationUrl, el QR apunta a /r/{slug} y redirige
//  - "static": NO redirige, el QR codifica directamente staticPayload (texto/URL/wifi/etc)
export const qrCodes = sqliteTable("qr_codes", {
  id: text("id").primaryKey(), // slug
  // Dueño. El slug es global (vive en la URL pública /r/<slug>), pero el QR
  // solo lo ve y edita quien lo creó.
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
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

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type QrCode = typeof qrCodes.$inferSelect;
export type NewQrCode = typeof qrCodes.$inferInsert;
export type QrScan = typeof qrScans.$inferSelect;
export type NewQrScan = typeof qrScans.$inferInsert;
