-- Kayıtta yazılan adın hesap metadata'sındaki kopyası — eski hesaplar.
--
-- Kayıt ekranındaki ad, e-posta doğrulaması beklenirken yazacak yer
-- olmadığı için hesabın metadata'sına (`display_name`) gidiyor; kurulumun
-- ilk adımı onu ayara (`app_settings.display_name`) taşıyor. Taşındıktan
-- sonra metadata'daki kopya hiçbir işe yaramıyor ve Profil'den ad
-- değişince ESKİ hâliyle hesapta kalıyordu. Uygulama artık taşıdıktan
-- sonra siliyor (src/app/(kurulum)/bilgiler.tsx); bu migration, kurulumu
-- daha önce bitirmiş hesaplardaki kopyayı temizliyor.
--
-- Yalnızca kurulumu BİTMİŞ hesaplar: yarıda kalan kurulumda ad henüz
-- ayara taşınmamış olabilir, silinirse sürücünün yazdığı ad kaybolur.
-- Koşul kabulü (`terms_*`) ve diğer anahtarlar yerinde kalıyor.
--
-- ELLE DOĞRULAMA:
--   select count(*) from auth.users u
--    where u.raw_user_meta_data ? 'display_name'
--      and exists (select 1 from public.app_settings s
--                   where s.user_id = u.id and s.onboarding_completed_at is not null);
--   -- uygulandıktan sonra 0 olmalı

update auth.users u
   set raw_user_meta_data = u.raw_user_meta_data - 'display_name'
 where u.raw_user_meta_data ? 'display_name'
   and exists (
     select 1 from public.app_settings s
      where s.user_id = u.id and s.onboarding_completed_at is not null
   );
