-- Kuyruktaki eski kayıtlara sahiplerini yazar.
--
-- `outbox.user_id` 0007'de eklendi; yeni kayıtlar sahibini kuyruğa
-- yazılırken satırın kendisinden alıyor. Eski kayıtlar da aynı yerden
-- doldurulur. Yerel satırı olmayan girdi boş kalır: gönderim onu yalnızca
-- kuyruktan düşürür, buluta dokunmaz.
UPDATE `outbox` SET `user_id` = (SELECT `user_id` FROM `app_settings` WHERE `app_settings`.`id` = `outbox`.`row_id`) WHERE `table_name` = 'app_settings' AND `user_id` IS NULL;
--> statement-breakpoint
UPDATE `outbox` SET `user_id` = (SELECT `user_id` FROM `vehicles` WHERE `vehicles`.`id` = `outbox`.`row_id`) WHERE `table_name` = 'vehicles' AND `user_id` IS NULL;
--> statement-breakpoint
UPDATE `outbox` SET `user_id` = (SELECT `user_id` FROM `vehicle_fuel_types` WHERE `vehicle_fuel_types`.`id` = `outbox`.`row_id`) WHERE `table_name` = 'vehicle_fuel_types' AND `user_id` IS NULL;
--> statement-breakpoint
UPDATE `outbox` SET `user_id` = (SELECT `user_id` FROM `earning_sources` WHERE `earning_sources`.`id` = `outbox`.`row_id`) WHERE `table_name` = 'earning_sources' AND `user_id` IS NULL;
--> statement-breakpoint
UPDATE `outbox` SET `user_id` = (SELECT `user_id` FROM `expense_categories` WHERE `expense_categories`.`id` = `outbox`.`row_id`) WHERE `table_name` = 'expense_categories' AND `user_id` IS NULL;
--> statement-breakpoint
UPDATE `outbox` SET `user_id` = (SELECT `user_id` FROM `shifts` WHERE `shifts`.`id` = `outbox`.`row_id`) WHERE `table_name` = 'shifts' AND `user_id` IS NULL;
--> statement-breakpoint
UPDATE `outbox` SET `user_id` = (SELECT `user_id` FROM `rides` WHERE `rides`.`id` = `outbox`.`row_id`) WHERE `table_name` = 'rides' AND `user_id` IS NULL;
--> statement-breakpoint
UPDATE `outbox` SET `user_id` = (SELECT `user_id` FROM `expenses` WHERE `expenses`.`id` = `outbox`.`row_id`) WHERE `table_name` = 'expenses' AND `user_id` IS NULL;
--> statement-breakpoint
UPDATE `outbox` SET `user_id` = (SELECT `user_id` FROM `recurring_expenses` WHERE `recurring_expenses`.`id` = `outbox`.`row_id`) WHERE `table_name` = 'recurring_expenses' AND `user_id` IS NULL;
--> statement-breakpoint
UPDATE `outbox` SET `user_id` = (SELECT `user_id` FROM `fuel_logs` WHERE `fuel_logs`.`id` = `outbox`.`row_id`) WHERE `table_name` = 'fuel_logs' AND `user_id` IS NULL;
--> statement-breakpoint
UPDATE `outbox` SET `user_id` = (SELECT `user_id` FROM `goals` WHERE `goals`.`id` = `outbox`.`row_id`) WHERE `table_name` = 'goals' AND `user_id` IS NULL;
--> statement-breakpoint
-- Eski, hesaptan bağımsız senkron durumu. Tek imleç bütün hesaplar ve
-- tablolar için ortaktı; yeni anahtarlar hesap ve tablo başına tutuluyor
-- ve boş başlıyor, yani ilk tur her şeyi baştan tarar. Bu tarama eski
-- imlecin atladığı kayıtları da getirir.
DELETE FROM `sync_state` WHERE `key` IN ('pull_cursor', 'last_success_at', 'last_error');
