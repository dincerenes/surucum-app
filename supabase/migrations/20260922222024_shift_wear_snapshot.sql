-- Vardiyanın yıpranma katsayısının anlık kopyası.
--
-- Rapor eskiden aracın BUGÜNKÜ katsayısını okuyordu: araç düzenlenince
-- (yalnızca adı değişse bile) katsayı güncel sabitle yeniden yazılıyor ve
-- bütün geçmiş vardiyaların gerçek kârı kayıyordu. Katsayı artık vardiya
-- açılırken kopyalanıyor — tüketim ve fiyat gibi. Kullanıcıya sorulmaz,
-- düzenlenmez.
--
-- UYGULAMA SIRASI: bu migration, sütunu yerele ekleyen uygulama
-- sürümünden ÖNCE uygulanmalı. Gönderim yerel satırı olduğu gibi
-- yolluyor; bulut sütunu tanımazsa vardiyaların gönderimi reddedilir.
alter table public.shifts
  add column if not exists wear_per_km_kurus bigint;

-- KESİN GEÇMİŞ BİLİNMİYOR: mevcut vardiyalar aracın BUGÜNKÜ katsayısıyla
-- dolduruluyor — raporun bugün gösterdiği sayı donuyor. Uygulamanın
-- yerel migration'ı cihazdaki satırları aynı kuralla dolduruyor.
-- updated_at değişmiyor; tetikleyici yalnızca server_updated_at'i ilerletir,
-- vardiyalar cihazlara bir kez yeniden iner.
update public.shifts s
   set wear_per_km_kurus = v.wear_per_km_kurus
  from public.vehicles v
 where v.id = s.vehicle_id
   and v.user_id = s.user_id
   and s.wear_per_km_kurus is null;
