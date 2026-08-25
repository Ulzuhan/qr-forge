-- Las cuentas pasan a vivir en Authentik.
--
-- Aquí ya no hay contraseñas ni aprobaciones: quién puede entrar lo decide el
-- proveedor de identidad, que solo emite tokens a quien esté en el grupo de
-- esta aplicación. Esta tabla queda como espejo local de la identidad, para
-- poder colgar de ella los QR (qr_codes.user_id) y las sesiones.
--
-- Se reconstruye en vez de usar ALTER porque SQLite no sabe quitar columnas ni
-- cambiar restricciones. Válido sobre una base sin usuarios, que era el caso.
CREATE TABLE `users_new` (
	`id` text PRIMARY KEY NOT NULL,
	-- Identificador estable que da Authentik. La identidad es esto, no el email:
	-- alguien puede cambiarse el correo y seguir siendo la misma persona.
	`oidc_sub` text NOT NULL UNIQUE,
	`email` text NOT NULL,
	`name` text,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
);
--> statement-breakpoint
DROP TABLE `users`;
--> statement-breakpoint
ALTER TABLE `users_new` RENAME TO `users`;
