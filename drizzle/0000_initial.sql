-- Initial schema for QR-Forge
-- Includes dynamic + static QR support
CREATE TABLE `qr_codes` (
	`id` text PRIMARY KEY NOT NULL,
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
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
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
