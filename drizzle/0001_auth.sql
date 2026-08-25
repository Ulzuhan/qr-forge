-- Cuentas de usuario y propiedad de los QRs.
--
-- qr_codes se reconstruye en vez de usar ALTER TABLE porque SQLite no permite
-- añadir una columna NOT NULL con clave foránea a una tabla existente. La copia
-- de filas asigna NULL como dueño, así que esta migración SOLO es válida sobre
-- una base sin QRs previos (era el caso al añadir el login: 0 filas). El flujo
-- normal es `npm run db:reset`, que reaplica las migraciones sobre una DB nueva.
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL UNIQUE,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);
--> statement-breakpoint
CREATE TABLE `qr_codes_new` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text DEFAULT 'dynamic' NOT NULL,
	`destination_url` text,
	`static_payload` text,
	`static_kind` text,
	`title` text NOT NULL,
	`description` text,
	`campaign` text,
	`is_active` integer DEFAULT true NOT NULL,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `qr_codes_new`
	SELECT `id`, NULL, `type`, `destination_url`, `static_payload`, `static_kind`,
	       `title`, `description`, `campaign`, `is_active`, `expires_at`,
	       `created_at`, `updated_at`
	FROM `qr_codes`;
--> statement-breakpoint
DROP TABLE `qr_codes`;
--> statement-breakpoint
ALTER TABLE `qr_codes_new` RENAME TO `qr_codes`;
--> statement-breakpoint
CREATE INDEX `qr_codes_user_idx` ON `qr_codes` (`user_id`);
