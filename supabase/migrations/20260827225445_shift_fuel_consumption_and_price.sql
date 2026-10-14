-- Vardiya sonunda sorulan ortalama tüketim ve o gün geçerli yakıt fiyatı.
--
-- İkisi de VARDİYAYA kopyalanıyor, araçtan okunmuyor: araçtaki değer
-- sürücünün en son beyanı ve değişiyor. Geçmiş bir günün yakıt maliyeti
-- bugün girilen yeni bir tüketimle ya da bugünkü fiyatla kaymamalı.
--
-- Tüketim 100 km başına mililitre (7,5 lt/100km → 7500).
alter table public.shifts
  add column if not exists fuel_consumption_per_100km integer,
  add column if not exists fuel_price_kurus bigint;
