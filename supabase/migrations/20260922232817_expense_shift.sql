-- Giderin girildiği vardiya.
--
-- Kayıtlar vardiya vardiya listeleniyor ve her vardiya kartı kendi cebe
-- kalanını gösteriyor; aynı gün iki vardiya açan sürücüde giderin
-- hangisine düştüğü ancak bu bağla bilinir.
--
-- Eski satırlar DOLDURULMUYOR: hangi vardiyaya ait oldukları kesin
-- bilinmiyor. Yabancı anahtar YOK — diğer kullanıcı tabloları gibi:
-- çevrimdışı girilen gider, vardiyasından önce buluta ulaşabilmeli.
--
-- UYGULAMA SIRASI: bu migration, sütunu yerele ekleyen uygulama
-- sürümünden ÖNCE uygulanmalı. Gönderim yerel satırı olduğu gibi
-- yolluyor; bulut sütunu tanımazsa giderlerin gönderimi reddedilir.
alter table public.expenses
  add column if not exists shift_id uuid;

create index if not exists expenses_shift_idx on public.expenses (shift_id);
