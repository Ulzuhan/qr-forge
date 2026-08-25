-- Altas con aprobación: pedir cuenta y esperar a que el administrador te deje entrar.
--
-- Una cuenta pendiente es una cuenta real con la contraseña ya cifrada y el email
-- reservado, solo que con approved_at a NULL. Guardarlo así, y no en una tabla de
-- solicitudes aparte, evita tener dos sitios donde acertar con el manejo de contraseñas.
ALTER TABLE `users` ADD COLUMN `role` text DEFAULT 'user' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `approved_at` integer;
