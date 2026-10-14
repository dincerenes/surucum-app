-- Uygulama içi geri bildirim.
--
-- Sürücü e-posta adresi görmeden, uygulamadan doğrudan yazıyor. Satırlar
-- YALNIZCA EKLENİR: sürücü kendi gönderdiğini okuyamaz, değiştiremez,
-- silemez (select/update/delete politikası yok). Okuma panelden ya da
-- service role ile. Senkron tablosu DEĞİL — outbox'a girmiyor, çevrimiçi
-- tek seferlik bir gönderim.
--
-- Hesap silinince geri bildirimleri de gider (on delete cascade).
create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  category    text not null check (category in ('hata', 'istek', 'oneri', 'diger')),
  message     text not null check (char_length(btrim(message)) between 1 and 2000),
  app_version text check (char_length(app_version) <= 40),
  platform    text check (char_length(platform) <= 40),
  status      text not null default 'yeni' check (status in ('yeni', 'okundu', 'cozuldu'))
);

alter table public.feedback enable row level security;

create policy "feedback_insert_own" on public.feedback
  for insert to authenticated
  with check ((select auth.uid()) = user_id and status = 'yeni');

create index feedback_created_idx on public.feedback (created_at desc);
create index feedback_user_id_idx on public.feedback (user_id);
