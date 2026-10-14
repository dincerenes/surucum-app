-- Vardiya sonunda tek rakam olarak girilen komisyon.
-- Oran kullanılmıyor: sürücü yüzdesini bilmiyor, kesileni biliyor.
alter table public.shifts
  add column if not exists commission_kurus bigint;

-- Yıpranma katsayısı 300 → 250 kuruş/km. Tek katsayı; amortisman, lastik,
-- bakım, MTV, sigorta hepsi içinde sayılıyor ve bilerek düşük tutuluyor.
-- MEVCUT SATIRLAR DEĞİŞMİYOR: geçmiş raporlar kaymasın.
alter table public.vehicles
  alter column wear_per_km_kurus set default 250;
