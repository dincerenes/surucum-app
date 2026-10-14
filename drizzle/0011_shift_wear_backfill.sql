-- Vardiyaların yıpranma katsayısı kopyasını doldurur.
--
-- KESİN GEÇMİŞ BİLİNMİYOR: eskiden katsayı vardiyaya kopyalanmıyordu ve
-- rapor aracın o anki değerini okuyordu. Mevcut vardiyalar aracın BUGÜNKÜ
-- katsayısıyla dolduruluyor — raporun şu an gösterdiği sayı neyse o
-- donuyor, hiçbir gün kaymıyor. Araç yalnızca AYNI HESABINSA okunur,
-- gün özetindeki birleştirmeyle aynı kural.
--
-- Kuyruğa YAZILMAZ ve updated_at DEĞİŞMEZ: bulut aynı değeri kendi
-- migration'ıyla dolduruyor (supabase/migrations, shift_wear_snapshot).
-- O migration BU SÜRÜMDEN ÖNCE uygulanmış olmalı; yoksa gönderim yeni
-- sütunu tanımayan bulut tarafından reddedilir.
UPDATE `shifts` SET `wear_per_km_kurus` = (
  SELECT `v`.`wear_per_km_kurus` FROM `vehicles` AS `v`
  WHERE `v`.`id` = `shifts`.`vehicle_id` AND `v`.`user_id` = `shifts`.`user_id`
) WHERE `wear_per_km_kurus` IS NULL;
--> statement-breakpoint
-- Vardiyaların çekme imleci baştan: sütun yerelde yeni. Başka bir
-- cihazın buluta yazdığı kopya, bu cihaza eski sürümle inmiş satırlarda
-- yok (eski sürüm tanımadığı sütunu atıyor). İmleç sıfırlanmazsa o
-- satırlar yereldeki dolgu değeriyle kalır ve bir sonraki düzeltmede
-- buluttakini ezerdi. Yeniden inen satır içerik aynıysa yazılmıyor.
DELETE FROM `sync_state` WHERE `key` LIKE 'pull:%:shifts';
