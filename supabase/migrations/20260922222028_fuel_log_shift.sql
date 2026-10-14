-- Dolumun girildiği vardiya.
--
-- Yakıt VARDİYA BAŞINA TEK SAYI: tüketim × km × fiyat hesaplanabiliyorsa
-- o sayılıyor, hesaplanamıyorsa o vardiyaya bağlı dolumlar. Bağ olmadan
-- günün tek bir tüketimli vardiyası o günün bütün dolumlarını hesaptan
-- çıkarıyordu.
--
-- Eski satırlar DOLDURULMUYOR: hangi vardiyaya ait oldukları bilinmiyor.
-- Yabancı anahtar YOK — diğer kullanıcı tabloları gibi: çevrimdışı
-- girilen dolum, vardiyasından önce buluta ulaşabilmeli.
--
-- UYGULAMA SIRASI: bu migration, sütunu yerele ekleyen uygulama
-- sürümünden ÖNCE uygulanmalı. Gönderim yerel satırı olduğu gibi
-- yolluyor; bulut sütunu tanımazsa dolumların gönderimi reddedilir.
alter table public.fuel_logs
  add column if not exists shift_id uuid;

create index if not exists fuel_logs_shift_idx on public.fuel_logs (shift_id);
