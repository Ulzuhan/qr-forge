-- Índices sobre qr_scans.
--
-- No tenía ninguno. Es la tabla que más crece del sistema —una fila por cada
-- escaneo— y todas las consultas de analíticas son COUNT y GROUP BY sobre los
-- escaneos de UN código, acotados por fecha. Sin índice, cada carga del panel
-- de estadísticas recorre la tabla entera, y el problema empeora solo con el
-- uso: cuanto mejor le va a un QR, más lento va su propio panel.
--
-- `IF NOT EXISTS` porque `qr_codes_user_idx` ya existía en la base aunque no
-- estuviera declarado en el esquema —habían divergido— y esta migración debe
-- poder aplicarse sobre una base ya migrada a mano.

CREATE INDEX IF NOT EXISTS `qr_scans_qr_idx` ON `qr_scans` (`qr_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `qr_scans_scanned_idx` ON `qr_scans` (`scanned_at`);
--> statement-breakpoint
-- Compuesto, que es la forma real de la consulta: los escaneos de un código
-- dentro de un rango de fechas. SQLite puede resolverla entera con este índice
-- sin tocar la tabla.
CREATE INDEX IF NOT EXISTS `qr_scans_qr_scanned_idx` ON `qr_scans` (`qr_id`, `scanned_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `qr_codes_user_idx` ON `qr_codes` (`user_id`);
