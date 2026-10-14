-- Profil alanları — Anasayfa selamlaması ve Profil ekranı için.
--
-- Üçü de boş olabilir: adı olmayan sürücü adsız selamlanıyor, avatarı
-- olmayana baş harfli hazır avatar çiziliyor. Uzunluk sınırları arayüzün
-- koyduğu sınırın biraz üstünde; bozuk bir istemci satırı şişiremesin.
alter table public.app_settings
  add column display_name text check (char_length(display_name) <= 60),
  add column city         text check (char_length(city) <= 40),
  add column avatar       text check (char_length(avatar) <= 300);
