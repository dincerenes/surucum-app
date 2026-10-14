-- Hesap silme işlemlerinin kanıtı.
--
-- KVKK Kişisel Verilerin Silinmesi, Yok Edilmesi veya Anonim Hale
-- Getirilmesi Hakkında Yönetmelik md. 7: silme işlemleri kayıt altına alınır
-- ve kayıtlar en az 3 yıl saklanır. Hesap silindiğinde cascade her şeyi
-- götürüyor; "bu hesap şu tarihte silindi" bilgisinin tutulduğu tek yer
-- burası.
--
-- İÇERİK KASITLI OLARAK DAR: yalnızca hesap kimliği (uuid), zaman, yöntem
-- ve sonuç. E-posta, ad ya da tutar YOK — silinen kişinin verisini "silme
-- kanıtı" adı altında saklamak, silmenin amacını boşa çıkarırdı. Hesap
-- silindikten sonra kimlik tek başına kimseye bağlanamıyor; kayıt yalnızca
-- "silme yapıldı mı, ne zaman" sorusunu cevaplıyor.
--
-- user_id'de yabancı anahtar YOK: satır yazıldığında hesap zaten silinmiş
-- olacak. Yabancı anahtar olsaydı ya ekleme reddedilirdi ya da cascade
-- kanıtı da silerdi.
--
-- Satırı `delete-account` Edge Function'ı service role ile yazar
-- (deleteUser BAŞARILI olduktan sonra). E-postayla gelen silme talebi
-- panelden elle işlenirse satır SQL editöründen elle eklenir:
--   insert into public.account_deletions (user_id, method, result)
--   values ('<uuid>', 'email_request', 'completed');
--
-- 3 yıldan eski satırları 20261003093709_retention_jobs.sql siliyor.
--
-- UYGULAMA SIRASI: 20261003093521_terms_acceptances.sql'den sonra, ve
-- delete-account fonksiyonunun yeni sürümü yayına alınmadan ÖNCE. Ters
-- sırada fonksiyon kanıtı yazamaz; silme yine başarılı olur, yalnızca
-- günlüğe hata düşer (o hesapların kanıtı günlükten elle eklenir).
--
-- ELLE DOĞRULAMA:
--   -- istemci rolleri yazamıyor/okuyamıyor → hepsi false
--   select has_table_privilege('anon', 'public.account_deletions', 'select'),
--          has_table_privilege('authenticated', 'public.account_deletions', 'insert'),
--          has_table_privilege('authenticated', 'public.account_deletions', 'delete');
--   -- fonksiyon yayına alındıktan sonra deneme hesabı uygulamadan silinince:
--   select * from public.account_deletions order by deleted_at desc limit 5;

create table public.account_deletions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  deleted_at timestamptz not null default now(),
  -- in_app        — Profil → Hesabımı sil (delete-account fonksiyonu)
  -- email_request — hesap silme sayfasındaki e-posta yolu, elle işlenen
  -- admin         — yönetici tarafından (ör. kötüye kullanım)
  method     text not null default 'in_app'
             check (method in ('in_app', 'email_request', 'admin')),
  result     text not null default 'completed'
             check (result in ('completed', 'failed'))
);

-- Saklama süresi taraması ve "bu hesap silindi mi" sorusu için.
create index account_deletions_deleted_at_idx on public.account_deletions (deleted_at);
create index account_deletions_user_id_idx    on public.account_deletions (user_id);

alter table public.account_deletions enable row level security;

-- Sürücü için HİÇBİR politika yok. Okuma: service role (RLS'i baypas eder)
-- ve panelde yalnızca owner/admin. 'support' görmez — rol modeli gereği
-- destek yalnızca toplamlarla çalışıyor.
create policy "account_deletions_select_admin" on public.account_deletions
  for select to authenticated
  using (public.has_admin_role(array['owner','admin']));

-- Yazma yalnızca service role'den. RLS zaten engelliyor; TRUNCATE RLS'e
-- tabi olmadığından yetkiler de geri alınıyor (bkz. terms_acceptances).
revoke all on table public.account_deletions from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.account_deletions from authenticated;
