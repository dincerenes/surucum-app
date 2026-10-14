-- Kullanım koşulları kabulünün güvenilir kaydı.
--
-- SORUN: kabul yalnızca hesabın metadata'sında duruyordu
-- (`raw_user_meta_data.terms_version`, `terms_accepted_at`). O alanı
-- kullanıcı `auth.updateUser({ data })` ile istediği an değiştirebilir;
-- `terms_accepted_at` üstelik cihaz saatiyle yazılıyor. Bir uyuşmazlıkta
-- "bu kişi şu sürümü şu tarihte kabul etti" diye gösterilebilecek bir kayıt
-- değil.
--
-- ÇÖZÜM: kabuller ayrı bir tabloya, SUNUCU saatiyle yazılıyor. Kullanıcı
-- kendi satırlarını okuyabilir ama ekleyemez, değiştiremez, silemez —
-- tablo yalnızca `security definer` tetikleyici ve fonksiyonla büyür.
-- (admin_audit_log ile aynı desen.)
--
--   signup   — kayıt anında, metadata'daki sürümle (tetikleyici)
--   app      — uygulama içinden yeni sürüm kabulü (accept_terms RPC)
--   backfill — bu migration'dan önce açılmış hesaplar; zaman = hesabın
--              açılış zamanı (auth.users.created_at, sunucu saati).
--              Metadata'daki istemci saati BİLEREK kullanılmıyor.
--
-- Hesap silinince kabul kayıtları da gider (on delete cascade): sözleşme
-- hesapla bitiyor; silme işleminin kendisi account_deletions'ta kalıyor.
--
-- UYGULAMA SIRASI (2 Ekim 2026 yasal inceleme paketi):
--   1. 20261003093521_terms_acceptances.sql      (bu dosya)
--   2. 20261003093530_account_deletions.sql
--      → ardından `supabase functions deploy delete-account`
--   3. 20261003093636_admin_access_logging.sql
--   4. 20261003093709_retention_jobs.sql
-- Bu dosya diğerlerinden bağımsız; uygulama sürümüyle sıra şartı yok
-- (istemci şimdilik accept_terms'i çağırmıyor, kayıt akışı aynı).
--
-- ELLE DOĞRULAMA (SQL editörü):
--   -- metadata'sında sürüm olan her hesabın bir satırı olmalı → 0 dönmeli
--   select count(*) from auth.users u
--    where u.raw_user_meta_data->>'terms_version' ~ '^[0-9]{1,9}$'
--      and not exists (select 1 from public.terms_acceptances t where t.user_id = u.id);
--   -- tetikleyici kurulu mu
--   select tgname, tgenabled from pg_trigger
--    where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_terms_acceptance';
--   -- istemci yazamıyor mu → üçü de false
--   select has_table_privilege('authenticated', 'public.terms_acceptances', 'insert'),
--          has_table_privilege('authenticated', 'public.terms_acceptances', 'update'),
--          has_table_privilege('authenticated', 'public.terms_acceptances', 'delete');
--   -- uygulamadan yeni bir hesap açınca source='signup' satırı düşmeli
--   select source, version, accepted_at from public.terms_acceptances
--    order by accepted_at desc limit 5;

-- ---------------------------------------------------------------------------
-- Tablo
-- ---------------------------------------------------------------------------

create table public.terms_acceptances (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  version     integer not null check (version > 0),
  -- Sunucu saati. İstemciden gelen bir zaman HİÇBİR yoldan buraya yazılmıyor.
  accepted_at timestamptz not null default now(),
  source      text not null check (source in ('signup', 'app', 'backfill')),

  -- Bir sürüm bir kez kabul edilir; delil İLK kabuldür. Aynı sürümü yeniden
  -- onaylamak yeni satır üretmez — accept_terms tekrar çağrılabilir
  -- (ağ hatasında yeniden deneme) ve geri doldurma yeniden çalıştırılabilir.
  unique (user_id, version)
);

-- unique (user_id, version) index'i user_id'yi öne aldığı için RLS
-- filtresine (user_id = auth.uid()) ayrıca index gerekmiyor.

alter table public.terms_acceptances enable row level security;

-- Kullanıcı yalnızca KENDİ kabullerini okur. INSERT/UPDATE/DELETE politikası
-- YOK: geçmişini değiştiremez.
create policy "terms_acceptances_select_own" on public.terms_acceptances
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Supabase public şemasındaki yeni tablolara anon/authenticated için TÜM
-- yetkileri varsayılan olarak verir. RLS politikası olmadığı için yazma
-- zaten reddediliyor; TRUNCATE ise RLS'e tabi DEĞİL. Delil tablosunda
-- yalnızca politikaya güvenmiyoruz.
revoke all on table public.terms_acceptances from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.terms_acceptances from authenticated;

-- ---------------------------------------------------------------------------
-- Kayıt anında: auth.users tetikleyicisi
-- ---------------------------------------------------------------------------

/*
 * Yeni hesabın metadata'sında geçerli bir terms_version varsa source='signup'
 * satırı yazar. Yoksa (OAuth, panelden davet, eski istemci) satır YAZMAZ —
 * koşulsuz "kabul etti" kaydı uydurulmuyor.
 *
 * HATA DAVRANIŞI — bilinçli seçim:
 *  - Metadata bozuksa (sayı değil, sıfır/negatif) satır yazılmaz ve kayıt
 *    DÜŞMEZ. Bozuk bir istemci yüzünden kayıt ekranı "veritabanı hatası"
 *    vermesin; kabul kaydı olmayan hesap yukarıdaki doğrulama sorgusuyla
 *    bulunur ve accept_terms ile tamamlanabilir.
 *  - Ekleme GERÇEKTEN başarısız olursa (beklenmez: tablo yok, yetki
 *    kaldırılmış) hata yutulmaz ve kayıt işlemi geri alınır. Sebep: kabulü
 *    ispatlanamayan bir hesabın sessizce açılması, hiç açılmamasından
 *    kötü. Hata sürer, sürücü kayıt olamaz → hemen fark edilir.
 *
 * Yalnızca INSERT: metadata sonradan updateUser ile değiştirilebildiği için
 * UPDATE'te tetiklenmek o güvenilmez yolu geri açardı. Yeni sürüm kabulü
 * accept_terms'ten geçer.
 *
 * Tetikleyiciyi auth şemasının rolü (supabase_auth_admin) tetikler; fonksiyon
 * `security definer` olduğu için tablo sahibi olarak yazar. Tetikleyiciler
 * EXECUTE yetkisi denetlemez, istemcilerden geri alınması tetikleyiciyi
 * bozmaz.
 */
create or replace function public.record_signup_terms_acceptance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_raw     text := new.raw_user_meta_data->>'terms_version';
  v_version integer;
begin
  -- Önce biçim, sonra dönüşüm: '1.5', 'abc' ya da taşan sayı istisna
  -- fırlatmadan elenir.
  if v_raw is null or v_raw !~ '^[0-9]{1,9}$' then
    return new;
  end if;

  v_version := v_raw::integer;
  if v_version <= 0 then
    return new;
  end if;

  insert into public.terms_acceptances (user_id, version, source)
  values (new.id, v_version, 'signup')
  on conflict (user_id, version) do nothing;

  return new;
end;
$fn$;

revoke execute on function public.record_signup_terms_acceptance()
  from public, anon, authenticated;

-- auth.users'ın sahibi supabase_auth_admin. postgres CREATE TRIGGER
-- yapabilir (TRIGGER yetkisi; Supabase'in belgelediği "yeni kullanıcı"
-- deseni), ama DROP TRIGGER tablo sahipliği ister — migration bir kez
-- çalıştığı için burada "drop if exists" YOK; o satır yetkiye takılıp
-- bütün migration'ı düşürebilirdi.
create trigger on_auth_user_terms_acceptance
  after insert on auth.users
  for each row execute function public.record_signup_terms_acceptance();

-- ---------------------------------------------------------------------------
-- Uygulamadan kabul: accept_terms
-- ---------------------------------------------------------------------------

/*
 * Oturumdaki kullanıcı için p_version sürümünün kabulünü kaydeder ve kabul
 * zamanını döner. Aynı sürüm daha önce kabul edildiyse yeni satır yazmaz,
 * İLK kabulün zamanını döner (yeniden denemeye dayanıklı).
 *
 * Sürümün "güncel" olup olmadığı burada denetlenmiyor: güncel sürüm
 * uygulamada (src/lib/legal.ts → TERMS_VERSION) tanımlı, sunucuda değil.
 * Kullanıcı ileri bir sürümü "kabul etmiş" görünebilir; bu ona bir hak
 * kazandırmaz, yalnızca kendi kaydıdır.
 */
create or replace function public.accept_terms(p_version integer)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_at  timestamptz;
begin
  if v_uid is null then
    raise exception 'Oturum gerekiyor.' using errcode = '42501';
  end if;

  if p_version is null or p_version <= 0 then
    raise exception 'Geçersiz sürüm: %', coalesce(p_version::text, '(boş)') using errcode = '22023';
  end if;

  insert into public.terms_acceptances (user_id, version, source)
  values (v_uid, p_version, 'app')
  on conflict (user_id, version) do nothing;

  select t.accepted_at into v_at
  from public.terms_acceptances t
  where t.user_id = v_uid and t.version = p_version;

  return v_at;
end;
$fn$;

revoke execute on function public.accept_terms(integer) from public, anon;
grant execute on function public.accept_terms(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Geri doldurma
-- ---------------------------------------------------------------------------

-- Tetikleyici YUKARIDA kuruldu: create trigger auth.users'ı kilitlediği için
-- bu işlem bitene kadar yeni kayıt bekler; aradan hesap kaçmaz.
--
-- Dönüşüm CASE içinde: WHERE'deki koşulların sırası garanti olmadığından
-- regex süzgeci ile ::integer aynı AND'e yazılsaydı bozuk bir metadata
-- bütün migration'ı düşürebilirdi.
insert into public.terms_acceptances (user_id, version, accepted_at, source)
select u.id, m.version, u.created_at, 'backfill'
from auth.users u
cross join lateral (
  select case
    when u.raw_user_meta_data->>'terms_version' ~ '^[0-9]{1,9}$'
      then (u.raw_user_meta_data->>'terms_version')::integer
  end as version
) m
where m.version > 0
on conflict (user_id, version) do nothing;
