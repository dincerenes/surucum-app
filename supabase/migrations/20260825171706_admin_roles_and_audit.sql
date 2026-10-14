-- Yönetim katmanı: admin rolleri ve denetim kaydı.
--
-- TASARIM KARARI — admin, sürücü verisini geniş bir SELECT politikasıyla
-- DEĞİL, denetlenen `security definer` fonksiyonlarla okur.
--
-- Sebep: bir RLS politikası kayıt tutamaz. "admin_users" tablosuna
-- `for select using (is_admin())` yazılsaydı, admin her sürücünün kazanç
-- verisini hiçbir iz bırakmadan okuyabilirdi. Sürücünün hasılatı hassas
-- veridir; ona bakmak bilinçli ve izlenebilir bir eylem olmalı.
--
-- Bu dosyada yalnızca YÖNETİM tabloları RLS ile korunur. Sürücü verisine
-- erişim 20260825170200_admin_metrics_functions.sql içindeki fonksiyonlarla
-- olur ve her erişim admin_audit_log'a düşer.

-- ---------------------------------------------------------------------------
-- Roller
-- ---------------------------------------------------------------------------

-- 'owner'   — admin atayabilir/kaldırabilir, ham sürücü verisi açabilir
-- 'admin'   — ham sürücü verisi açabilir, yönetim tablolarını düzenler
-- 'support' — yalnızca toplamları görür; ham kayıt açamaz
create table public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'admin' check (role in ('owner','admin','support')),
  note       text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table public.admin_users enable row level security;

-- Bu fonksiyonlar SECURITY DEFINER olmak ZORUNDA: admin_users üzerindeki
-- RLS politikaları bunları çağırıyor. INVOKER olsalardı politika kendi
-- tablosunu okumaya çalışır ve sonsuz döngü oluşurdu.
--
-- search_path boş bırakılıyor: fonksiyon sahibinin arama yoluna güvenen bir
-- saldırgan, aynı adla sahte bir tablo yaratıp yetki yükseltebilir.
create or replace function public.admin_role()
returns text
language sql
stable
security definer
set search_path = ''
as $fn$
  select a.role from public.admin_users a where a.user_id = (select auth.uid());
$fn$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.admin_users a where a.user_id = (select auth.uid())
  );
$fn$;

/*
 * Rol listesine göre yetki denetimi.
 * Ham sürücü verisi açan fonksiyonlar bunu array['owner','admin'] ile çağırır;
 * 'support' rolü böylece toplamların dışına çıkamaz.
 */
create or replace function public.has_admin_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid()) and a.role = any(p_roles)
  );
$fn$;

-- CREATE FUNCTION varsayılan olarak EXECUTE yetkisini PUBLIC'e verir.
-- Oturum açmamış birinin yetki fonksiyonu çağırmasının hiçbir anlamı yok.
revoke execute on function public.admin_role() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.has_admin_role(text[]) from public, anon;

grant execute on function public.admin_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_admin_role(text[]) to authenticated;

-- Adminler birbirini görür; yalnızca 'owner' rol atayabilir.
create policy "admin_users_select" on public.admin_users
  for select to authenticated
  using (public.is_admin());

create policy "admin_users_insert_owner" on public.admin_users
  for insert to authenticated
  with check (public.has_admin_role(array['owner']));

create policy "admin_users_update_owner" on public.admin_users
  for update to authenticated
  using (public.has_admin_role(array['owner']))
  with check (public.has_admin_role(array['owner']));

create policy "admin_users_delete_owner" on public.admin_users
  for delete to authenticated
  using (public.has_admin_role(array['owner']));

-- ---------------------------------------------------------------------------
-- Denetim kaydı
-- ---------------------------------------------------------------------------

/*
 * Admin'in yaptığı her iş buraya düşer.
 *
 * TASARIM KARARI — bu tabloda INSERT, UPDATE ve DELETE politikası YOK.
 * Yalnızca SELECT var. Satır eklemenin tek yolu `security definer`
 * fonksiyonlar ve tetikleyiciler; onlar tablo sahibi olarak çalıştığı için
 * RLS'e takılmaz. Sonuç: admin kayıt uydursa da olmaz, sildirse de olmaz.
 * Denetim kaydının değeri tamamen buradan geliyor.
 */
create table public.admin_audit_log (
  id          bigint generated always as identity primary key,

  -- Boş olabilir: cron ve Edge Function'lar service_role ile yazar, onların
  -- auth.uid()'i yoktur. NOT NULL bırakılsaydı yakıt fiyatı güncelleyen
  -- zamanlanmış iş, fuel_prices üzerindeki denetim tetikleyicisine takılıp
  -- çökerdi.
  admin_id    uuid references auth.users(id) on delete set null,

  -- Hesap silinse de iz kalsın diye e-posta yazma anında kopyalanıyor.
  -- Yalnızca yabancı anahtara güvenilseydi, admin hesabını silmek kendi
  -- geçmişini de silerdi — denetim kaydının varlık sebebine aykırı.
  admin_email text,

  source      text not null default 'admin' check (source in ('admin','system')),

  action      text not null,
  target_type text,
  target_id   text,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index admin_audit_log_admin_idx   on public.admin_audit_log (admin_id, created_at desc);
create index admin_audit_log_target_idx  on public.admin_audit_log (target_type, target_id, created_at desc);

alter table public.admin_audit_log enable row level security;

create policy "admin_audit_log_select" on public.admin_audit_log
  for select to authenticated
  using (public.is_admin());

/*
 * Denetim satırı yazar. Yalnızca diğer definer fonksiyonlar ve
 * tetikleyiciler çağırır — istemciden EXECUTE yetkisi geri alınıyor,
 * yoksa admin istediği eylemi uydurabilirdi.
 */
create or replace function public.log_admin_action(
  p_action      text,
  p_target_type text default null,
  p_target_id   text default null,
  p_detail      jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := (select auth.uid());
begin
  insert into public.admin_audit_log (
    admin_id, admin_email, source, action, target_type, target_id, detail
  )
  values (
    v_uid,
    (select u.email::text from auth.users u where u.id = v_uid),
    case when v_uid is null then 'system' else 'admin' end,
    p_action, p_target_type, p_target_id, coalesce(p_detail, '{}'::jsonb)
  );
end;
$fn$;

revoke execute on function public.log_admin_action(text, text, text, jsonb)
  from public, anon, authenticated;

/*
 * Yönetim tablolarındaki her değişikliği otomatik loglayan tetikleyici.
 *
 * Fonksiyon değil tetikleyici kullanılmasının sebebi: panel bu tabloları
 * normal PostgREST çağrılarıyla düzenliyor. Loglama uygulamaya bırakılsaydı
 * bir çağrıyı loglamayı unutmak yeterdi. Tetikleyici atlanamaz.
 */
create or replace function public.audit_admin_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_row    jsonb;
  v_target text;
  v_uid    uuid := (select auth.uid());
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  -- Birincil anahtar tablodan tabloya değişiyor (uuid id, text key, uuid user_id).
  v_target := coalesce(v_row->>'id', v_row->>'key', v_row->>'user_id');

  insert into public.admin_audit_log (
    admin_id, admin_email, source, action, target_type, target_id, detail
  )
  values (
    v_uid,
    (select u.email::text from auth.users u where u.id = v_uid),
    case when v_uid is null then 'system' else 'admin' end,
    lower(tg_op),
    tg_table_name,
    v_target,
    case
      when tg_op = 'UPDATE' then jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new))
      else v_row
    end
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$fn$;

revoke execute on function public.audit_admin_change() from public, anon, authenticated;

create trigger admin_users_audit
  after insert or update or delete on public.admin_users
  for each row execute function public.audit_admin_change();

-- ---------------------------------------------------------------------------
-- İLK ADMİN (bootstrap)
-- ---------------------------------------------------------------------------
--
-- Politikalar gereği admin'i yalnızca bir 'owner' atayabilir; ilk owner'ı
-- atayacak kimse yok. Bu yüzden ilk kayıt Supabase SQL editöründen
-- (service_role, RLS'i baypas eder) ELLE atılır:
--
--   insert into public.admin_users (user_id, role, note)
--   select id, 'owner', 'kurucu' from auth.users where email = 'ornek@ornek.com';
--
-- Bunu migration'a gömmüyoruz: e-posta adresi ortama göre değişir ve
-- depoya yazılmış bir yönetici adresi gereksiz bir hedef göstergesidir.
