CREATE TABLE `qr_scans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`qr_id` text NOT NULL,
	`ip` text,
	`user_agent` text,
	`referer` text,
	`country` text,
	`scanned_at` integer NOT NULL,
	FOREIGN KEY (`qr_id`) REFERENCES `qr_codes`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);
CREATE TABLE IF NOT EXISTS "qr_codes" (
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
CREATE INDEX `qr_codes_user_idx` ON `qr_codes` (`user_id`);
CREATE TABLE IF NOT EXISTS "users" (
	`id` text PRIMARY KEY NOT NULL,
	-- Identificador estable que da Authentik. La identidad es esto, no el email:
	-- alguien puede cambiarse el correo y seguir siendo la misma persona.
	`oidc_sub` text NOT NULL UNIQUE,
	`email` text NOT NULL,
	`name` text,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
);
CREATE INDEX `qr_scans_qr_idx` ON `qr_scans` (`qr_id`);
CREATE INDEX `qr_scans_scanned_idx` ON `qr_scans` (`scanned_at`);
CREATE INDEX `qr_scans_qr_scanned_idx` ON `qr_scans` (`qr_id`, `scanned_at`);
