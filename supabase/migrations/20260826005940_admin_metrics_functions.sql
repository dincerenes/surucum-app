-- Yönetim sorguları.
--
-- Buradaki her fonksiyon `security definer`'dır ve İLK İŞ olarak yetki
-- denetimi yapar.

create or replace function public.admin_assert(
  p_roles text[] default array['owner','admin','support']
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if not exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid()) and a.role = any(p_roles)
  ) then
    -- 42501 = insufficient_privilege. PostgREST bunu 403'e çevirir.
    raise exception 'Bu işlem için yönetici yetkisi gerekiyor.' using errcode = '42501';
  end if;
end;
$fn$;

revoke execute on function public.admin_assert(text[]) from public, anon, authenticated;

/*
 * Bir bütünlük denetimini çalıştırır: kaç kayıt bozuk ve örnek beş kimlik.
 *
 * GÜVENLİK NOTU — bu fonksiyon dinamik SQL çalıştırır. p_from ve p_where
 * istemciden GELMEZ; yalnızca admin_system_health() gövdesinde, bu
 * migration'da yazılmış sabit metinlerle çağrılır. EXECUTE yetkisi tüm
 * istemci rollerinden geri alınıyor.
 */
create or replace function public.admin_health_check(
  p_key text, p_label text, p_severity text, p_from text, p_where text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_count bigint;
  v_ids   text[];
begin
  execute format('select count(*) from %s where %s', p_from, p_where) into v_count;
  execute format(
    'select coalesce(array_agg(t.id::text), array[]::text[]) from (select id from %s where %s limit 5) t',
    p_from, p_where
  ) into v_ids;

  return jsonb_build_object(
    'key', p_key, 'label', p_label, 'severity', p_severity,
    'count', v_count, 'samples', to_jsonb(v_ids)
  );
end;
$fn$;

revoke execute on function public.admin_health_check(text, text, text, text, text)
  from public, anon, authenticated;

/*
 * Verilen andan beri kayıt yazmış farklı kullanıcı sayısı.
 * Ölçüt server_updated_at, updated_at DEĞİL: cihaz saati yanlış olan bir
 * sürücü aktiflik grafiğini kaydırırdı.
 */
create or replace function public.admin_active_users(p_since timestamptz)
returns bigint
language sql
stable
security definer
set search_path = ''
as $fn$
  select count(*) from (
    select r.user_id from public.rides     r where r.server_updated_at >= p_since
    union
    select s.user_id from public.shifts    s where s.server_updated_at >= p_since
    union
    select e.user_id from public.expenses  e where e.server_updated_at >= p_since
    union
    select f.user_id from public.fuel_logs f where f.server_updated_at >= p_since
  ) s;
$fn$;

revoke execute on function public.admin_active_users(timestamptz)
  from public, anon, authenticated;

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_now timestamptz := now();
begin
  perform public.admin_assert();

  return jsonb_build_object(
    'generated_at', v_now,

    'users', jsonb_build_object(
      'total',     (select count(*) from auth.users u where u.deleted_at is null),
      'confirmed', (select count(*) from auth.users u where u.deleted_at is null and u.email_confirmed_at is not null),
      'banned',    (select count(*) from auth.users u where u.deleted_at is null and u.banned_until > v_now),
      'new_24h',   (select count(*) from auth.users u where u.created_at >= v_now - interval '1 day'),
      'new_7d',    (select count(*) from auth.users u where u.created_at >= v_now - interval '7 days'),
      'new_30d',   (select count(*) from auth.users u where u.created_at >= v_now - interval '30 days')
    ),

    'activity', jsonb_build_object(
      'dau', public.admin_active_users(v_now - interval '1 day'),
      'wau', public.admin_active_users(v_now - interval '7 days'),
      'mau', public.admin_active_users(v_now - interval '30 days')
    ),

    -- Yumuşak silinenler sayılmıyor: sürücü sildiyse o kayıt yok sayılır.
    'records', jsonb_build_object(
      'rides',              (select count(*) from public.rides              where deleted_at is null),
      'shifts',             (select count(*) from public.shifts             where deleted_at is null),
      'expenses',           (select count(*) from public.expenses           where deleted_at is null),
      'fuel_logs',          (select count(*) from public.fuel_logs          where deleted_at is null),
      'vehicles',           (select count(*) from public.vehicles           where deleted_at is null),
      'earning_sources',    (select count(*) from public.earning_sources    where deleted_at is null),
      'recurring_expenses', (select count(*) from public.recurring_expenses where deleted_at is null),
      'goals',              (select count(*) from public.goals              where deleted_at is null)
    ),

    -- Tümü tam sayı kuruş. Bu sınırda bile ondalık üretmiyoruz.
    'money', jsonb_build_object(
      'gross_kurus',      (select coalesce(sum(gross_amount_kurus), 0)::bigint from public.rides     where deleted_at is null),
      'commission_kurus', (select coalesce(sum(commission_kurus), 0)::bigint   from public.rides     where deleted_at is null),
      'net_kurus',        (select coalesce(sum(net_amount_kurus), 0)::bigint   from public.rides     where deleted_at is null),
      'tip_kurus',        (select coalesce(sum(tip_kurus), 0)::bigint          from public.rides     where deleted_at is null),
      'expense_kurus',    (select coalesce(sum(amount_kurus), 0)::bigint       from public.expenses  where deleted_at is null),
      'fuel_kurus',       (select coalesce(sum(total_amount_kurus), 0)::bigint from public.fuel_logs where deleted_at is null)
    ),

    -- Senkron gerçekten akıyor mu.
    'sync', jsonb_build_object(
      'rows_24h', (
        (select count(*) from public.rides     where server_updated_at >= v_now - interval '1 day') +
        (select count(*) from public.shifts    where server_updated_at >= v_now - interval '1 day') +
        (select count(*) from public.expenses  where server_updated_at >= v_now - interval '1 day') +
        (select count(*) from public.fuel_logs where server_updated_at >= v_now - interval '1 day')
      ),
      'last_write_at', (
        select max(m) from (values
          ((select max(server_updated_at) from public.rides)),
          ((select max(server_updated_at) from public.shifts)),
          ((select max(server_updated_at) from public.expenses)),
          ((select max(server_updated_at) from public.fuel_logs))
        ) as t(m)
      )
    )
  );
end;
$fn$;

revoke execute on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

/*
 * Günlük seri. Gün sınırı Europe/Istanbul'a göre kesiliyor, UTC'ye göre
 * değil: UTC kullanılsaydı gece 03:00'te girilen sefer bir önceki güne
 * düşerdi.
 */
create or replace function public.admin_growth(p_days integer default 30)
returns table (
  day          date,
  signups      bigint,
  active_users bigint,
  rides        bigint,
  net_kurus    bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_today date := (timezone('Europe/Istanbul', now()))::date;
begin
  perform public.admin_assert();

  return query
  with d as (
    select generate_series(v_today - (v_days - 1), v_today, interval '1 day')::date as day
  )
  select
    d.day,
    (select count(*) from auth.users u
       where timezone('Europe/Istanbul', u.created_at)::date = d.day),
    (select count(*) from (
       select r.user_id from public.rides     r where timezone('Europe/Istanbul', r.server_updated_at)::date = d.day
       union
       select s.user_id from public.shifts    s where timezone('Europe/Istanbul', s.server_updated_at)::date = d.day
       union
       select e.user_id from public.expenses  e where timezone('Europe/Istanbul', e.server_updated_at)::date = d.day
       union
       select f.user_id from public.fuel_logs f where timezone('Europe/Istanbul', f.server_updated_at)::date = d.day
     ) a),
    (select count(*) from public.rides r
       where r.business_date = d.day and r.deleted_at is null),
    (select coalesce(sum(r.net_amount_kurus), 0)::bigint from public.rides r
       where r.business_date = d.day and r.deleted_at is null)
  from d
  order by d.day;
end;
$fn$;

revoke execute on function public.admin_growth(integer) from public, anon;
grant execute on function public.admin_growth(integer) to authenticated;

/*
 * Kullanıcı listesi. PARA TOPLAMI döner ama seferin kendisini DÖNMEZ.
 * Erişim burada loglanmıyor: liste her sayfa yenilemede çağrılır ve her
 * çağrıyı loglamak denetim kaydını gürültüye boğardı.
 */
create or replace function public.admin_user_list(
  p_search text default null,
  p_limit  integer default 50,
  p_offset integer default 0,
  p_sort   text default 'created_at'
)
returns table (
  user_id          uuid,
  email            text,
  created_at       timestamptz,
  last_sign_in_at  timestamptz,
  confirmed        boolean,
  banned           boolean,
  admin_role       text,
  vehicle_count    bigint,
  ride_count       bigint,
  last_activity_at timestamptz,
  net_total_kurus  bigint,
  total_count      bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_limit  integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_search text    := nullif(trim(coalesce(p_search, '')), '');
  v_sort   text    := coalesce(p_sort, 'created_at');
begin
  perform public.admin_assert();

  return query
  with base as (
    select
      u.id,
      u.email::text                     as email,
      u.created_at,
      u.last_sign_in_at,
      (u.email_confirmed_at is not null) as confirmed,
      (u.banned_until > now())           as banned,
      (select a.role from public.admin_users a where a.user_id = u.id) as admin_role,
      (select count(*) from public.vehicles v where v.user_id = u.id and v.deleted_at is null) as vehicle_count,
      (select count(*) from public.rides r where r.user_id = u.id and r.deleted_at is null)    as ride_count,
      (select coalesce(sum(r.net_amount_kurus), 0)::bigint from public.rides r
         where r.user_id = u.id and r.deleted_at is null)                                      as net_total_kurus,
      greatest(
        (select max(r.server_updated_at) from public.rides     r where r.user_id = u.id),
        (select max(s.server_updated_at) from public.shifts    s where s.user_id = u.id),
        (select max(e.server_updated_at) from public.expenses  e where e.user_id = u.id),
        (select max(f.server_updated_at) from public.fuel_logs f where f.user_id = u.id)
      ) as last_activity_at
    from auth.users u
    where u.deleted_at is null
      and (
        v_search is null
        or u.email::text ilike '%' || v_search || '%'
        or u.id::text = v_search
      )
  )
  select
    b.id, b.email, b.created_at, b.last_sign_in_at,
    b.confirmed, coalesce(b.banned, false), b.admin_role,
    b.vehicle_count, b.ride_count, b.last_activity_at, b.net_total_kurus,
    count(*) over () as total_count
  from base b
  order by
    -- Sayısal sıralar ve zaman sıraları ayrı CASE'lerde: tek CASE içinde
    -- bigint ile timestamptz karıştırılamaz.
    case v_sort when 'rides' then b.ride_count when 'net' then b.net_total_kurus end desc nulls last,
    case v_sort
      when 'created_at'    then b.created_at
      when 'last_sign_in'  then b.last_sign_in_at
      when 'last_activity' then b.last_activity_at
    end desc nulls last,
    b.created_at desc
  limit v_limit offset v_offset;
end;
$fn$;

revoke execute on function public.admin_user_list(text, integer, integer, text) from public, anon;
grant execute on function public.admin_user_list(text, integer, integer, text) to authenticated;

/*
 * Tek kullanıcının toplamları.
 * VOLATILE (stable değil) çünkü denetim kaydına satır yazıyor.
 */
create or replace function public.admin_user_detail(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v jsonb;
begin
  perform public.admin_assert();

  select jsonb_build_object(
    'user', jsonb_build_object(
      'id', u.id,
      'email', u.email::text,
      'created_at', u.created_at,
      'last_sign_in_at', u.last_sign_in_at,
      'email_confirmed_at', u.email_confirmed_at,
      'banned_until', u.banned_until,
      'admin_role', (select a.role from public.admin_users a where a.user_id = u.id)
    ),
    'settings', (
      select jsonb_build_object(
        'day_cutoff_hour', s.day_cutoff_hour,
        'region_code', s.region_code,
        'onboarding_completed_at', s.onboarding_completed_at
      )
      from public.app_settings s
      where s.user_id = u.id and s.deleted_at is null
      order by s.updated_at desc limit 1
    ),
    'counts', jsonb_build_object(
      'vehicles',           (select count(*) from public.vehicles           where user_id = u.id and deleted_at is null),
      'earning_sources',    (select count(*) from public.earning_sources    where user_id = u.id and deleted_at is null),
      'shifts',             (select count(*) from public.shifts             where user_id = u.id and deleted_at is null),
      'rides',              (select count(*) from public.rides              where user_id = u.id and deleted_at is null),
      'expenses',           (select count(*) from public.expenses           where user_id = u.id and deleted_at is null),
      'fuel_logs',          (select count(*) from public.fuel_logs          where user_id = u.id and deleted_at is null),
      'recurring_expenses', (select count(*) from public.recurring_expenses where user_id = u.id and deleted_at is null),
      'goals',              (select count(*) from public.goals              where user_id = u.id and deleted_at is null)
    ),
    'money', jsonb_build_object(
      'gross_kurus',      (select coalesce(sum(gross_amount_kurus), 0)::bigint from public.rides     where user_id = u.id and deleted_at is null),
      'commission_kurus', (select coalesce(sum(commission_kurus), 0)::bigint   from public.rides     where user_id = u.id and deleted_at is null),
      'net_kurus',        (select coalesce(sum(net_amount_kurus), 0)::bigint   from public.rides     where user_id = u.id and deleted_at is null),
      'tip_kurus',        (select coalesce(sum(tip_kurus), 0)::bigint          from public.rides     where user_id = u.id and deleted_at is null),
      'expense_kurus',    (select coalesce(sum(amount_kurus), 0)::bigint       from public.expenses  where user_id = u.id and deleted_at is null),
      'fuel_kurus',       (select coalesce(sum(total_amount_kurus), 0)::bigint from public.fuel_logs where user_id = u.id and deleted_at is null)
    ),
    'range', jsonb_build_object(
      'first_business_date', (select min(business_date) from public.rides where user_id = u.id and deleted_at is null),
      'last_business_date',  (select max(business_date) from public.rides where user_id = u.id and deleted_at is null),
      'last_activity_at', greatest(
        (select max(r.server_updated_at) from public.rides     r where r.user_id = u.id),
        (select max(s.server_updated_at) from public.shifts    s where s.user_id = u.id),
        (select max(e.server_updated_at) from public.expenses  e where e.user_id = u.id),
        (select max(f.server_updated_at) from public.fuel_logs f where f.user_id = u.id)
      )
    )
  )
  into v
  from auth.users u
  where u.id = p_user_id;

  if v is null then
    raise exception 'Kullanıcı bulunamadı.' using errcode = 'P0002';
  end if;

  perform public.log_admin_action('user_detail_view', 'user', p_user_id::text);
  return v;
end;
$fn$;

revoke execute on function public.admin_user_detail(uuid) from public, anon;
grant execute on function public.admin_user_detail(uuid) to authenticated;

/*
 * Bir kullanıcının ham satırlarını döner. Panelin en hassas ucu.
 * Üç koruma: rol denetimi ('support' giremez), tablo adı beyaz listesi,
 * ve her çağrının denetim kaydına düşmesi.
 */
create or replace function public.admin_user_records(
  p_user_id uuid,
  p_table   text,
  p_limit   integer default 100,
  p_offset  integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_allowed text[] := array[
    'app_settings', 'vehicles', 'vehicle_fuel_types', 'earning_sources',
    'expense_categories', 'shifts', 'rides', 'expenses',
    'recurring_expenses', 'fuel_logs', 'goals'
  ];
  v_limit  integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_rows   jsonb;
  v_total  bigint;
begin
  perform public.admin_assert(array['owner','admin']);

  if p_table is null or not (p_table = any(v_allowed)) then
    raise exception 'Geçersiz tablo: %', coalesce(p_table, '(boş)') using errcode = '22023';
  end if;

  execute format('select count(*) from public.%I where user_id = $1', p_table)
    into v_total using p_user_id;

  execute format(
    'select coalesce(jsonb_agg(t), ''[]''::jsonb) from ('
    || 'select * from public.%I where user_id = $1 '
    || 'order by server_updated_at desc limit $2 offset $3) t',
    p_table
  ) into v_rows using p_user_id, v_limit, v_offset;

  perform public.log_admin_action(
    'user_records_view', 'user', p_user_id::text,
    jsonb_build_object('table', p_table, 'limit', v_limit, 'offset', v_offset)
  );

  return jsonb_build_object('table', p_table, 'total', v_total, 'rows', v_rows);
end;
$fn$;

revoke execute on function public.admin_user_records(uuid, text, integer, integer) from public, anon;
grant execute on function public.admin_user_records(uuid, text, integer, integer) to authenticated;

/*
 * Bütünlük denetimleri. Genel değil, BU uygulamaya özel:
 *  - brüt ≠ komisyon + net  → para hesabında kayma
 *  - yetim yabancı anahtar  → senkron sırası bozulmuş
 *  - business_date kayması  → gün kesme saati hesabı hatalı
 *  - gelecek tarihli kayıt  → cihaz saati yanlış
 *  - açık kalmış vardiya    → TL/saat paydası bozulur
 */
create or replace function public.admin_system_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  perform public.admin_assert();

  return jsonb_build_object(
    'generated_at', now(),

    'checks', jsonb_build_array(
      public.admin_health_check(
        'money_mismatch', 'Brüt ≠ komisyon + net olan sefer', 'critical',
        'public.rides r',
        'r.deleted_at is null and r.gross_amount_kurus <> r.commission_kurus + r.net_amount_kurus'
      ),
      public.admin_health_check(
        'negative_ride', 'Negatif tutarlı sefer', 'critical',
        'public.rides r',
        'r.deleted_at is null and (r.gross_amount_kurus < 0 or r.net_amount_kurus < 0 or r.commission_kurus < 0)'
      ),
      public.admin_health_check(
        'orphan_ride_source', 'Silinmiş kazanç kaynağına bağlı sefer', 'warning',
        'public.rides r',
        'r.deleted_at is null and not exists (select 1 from public.earning_sources s where s.id = r.earning_source_id and s.deleted_at is null)'
      ),
      public.admin_health_check(
        'orphan_ride_shift', 'Var olmayan vardiyaya bağlı sefer', 'warning',
        'public.rides r',
        'r.deleted_at is null and r.shift_id is not null and not exists (select 1 from public.shifts s where s.id = r.shift_id)'
      ),
      public.admin_health_check(
        'orphan_expense_category', 'Silinmiş kategoriye bağlı gider', 'warning',
        'public.expenses e',
        'e.deleted_at is null and not exists (select 1 from public.expense_categories c where c.id = e.category_id and c.deleted_at is null)'
      ),
      public.admin_health_check(
        'orphan_fuel_vehicle', 'Var olmayan araca bağlı yakıt kaydı', 'warning',
        'public.fuel_logs f',
        'f.deleted_at is null and not exists (select 1 from public.vehicles v where v.id = f.vehicle_id)'
      ),
      public.admin_health_check(
        'orphan_shift_vehicle', 'Var olmayan araca bağlı vardiya', 'warning',
        'public.shifts s',
        's.deleted_at is null and not exists (select 1 from public.vehicles v where v.id = s.vehicle_id)'
      ),
      public.admin_health_check(
        'ride_date_drift', 'business_date ile gerçek zamanı bir günden fazla uyuşmayan sefer', 'warning',
        'public.rides r',
        'r.deleted_at is null and abs(r.business_date - (timezone(''Europe/Istanbul'', to_timestamp(r.occurred_at / 1000.0)))::date) > 1'
      ),
      public.admin_health_check(
        'future_ride', 'Gelecek tarihli sefer (cihaz saati şüpheli)', 'warning',
        'public.rides r',
        format('r.deleted_at is null and r.occurred_at > %s', v_now_ms + 86400000)
      ),
      public.admin_health_check(
        'stale_open_shift', '24 saatten uzun süredir açık vardiya', 'warning',
        'public.shifts s',
        format('s.deleted_at is null and s.ended_at is null and s.started_at < %s', v_now_ms - 86400000)
      ),
      public.admin_health_check(
        'invalid_fuel_log', 'Hacmi veya birim fiyatı sıfır/negatif yakıt kaydı', 'warning',
        'public.fuel_logs f',
        'f.deleted_at is null and (f.volume_per1000 <= 0 or f.unit_price_kurus <= 0)'
      ),
      public.admin_health_check(
        'duplicate_settings', 'Birden fazla ayar satırı olan kullanıcı', 'critical',
        '(select user_id as id from public.app_settings where deleted_at is null group by user_id having count(*) > 1) d',
        'true'
      ),
      public.admin_health_check(
        'ride_without_vehicle', 'Aracı olmadığı hâlde sefer girmiş kullanıcı', 'info',
        '(select distinct r.user_id as id from public.rides r where r.deleted_at is null and not exists (select 1 from public.vehicles v where v.user_id = r.user_id and v.deleted_at is null)) d',
        'true'
      )
    ),

    -- Yakıt fiyatı tazeliği: cron'un çalışıp çalışmadığının tek göstergesi.
    'fuel_prices', jsonb_build_object(
      'regions', (select count(distinct region_code) from public.fuel_prices),
      'rows',    (select count(*) from public.fuel_prices),
      'latest_effective_date', (select max(effective_date) from public.fuel_prices),
      'last_fetched_at', (select to_timestamp(max(fetched_at) / 1000.0) from public.fuel_prices),
      'hours_since_fetch', (
        select round(extract(epoch from (now() - to_timestamp(max(fetched_at) / 1000.0))) / 3600.0, 1)
        from public.fuel_prices
      ),
      'stale_combinations', (
        select count(*) from (
          select region_code, fuel_type, max(effective_date) as latest
          from public.fuel_prices
          group by region_code, fuel_type
          having max(effective_date) < (timezone('Europe/Istanbul', now()))::date - 2
        ) s
      )
    ),

    'volumes', jsonb_build_object(
      'rides_24h',     (select count(*) from public.rides     where server_updated_at >= now() - interval '1 day'),
      'shifts_24h',    (select count(*) from public.shifts    where server_updated_at >= now() - interval '1 day'),
      'expenses_24h',  (select count(*) from public.expenses  where server_updated_at >= now() - interval '1 day'),
      'fuel_logs_24h', (select count(*) from public.fuel_logs where server_updated_at >= now() - interval '1 day'),
      'soft_deleted', (
        (select count(*) from public.rides     where deleted_at is not null) +
        (select count(*) from public.shifts    where deleted_at is not null) +
        (select count(*) from public.expenses  where deleted_at is not null) +
        (select count(*) from public.fuel_logs where deleted_at is not null)
      )
    )
  );
end;
$fn$;

revoke execute on function public.admin_system_health() from public, anon;
grant execute on function public.admin_system_health() to authenticated;

/*
 * E-posta ile admin atar. Panelin auth.users'ı doğrudan sorgulama yetkisi
 * yok — olması da istenmez — bu yüzden çözümleme burada yapılıyor.
 */
create or replace function public.admin_grant_role(p_email text, p_role text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user_id uuid;
begin
  perform public.admin_assert(array['owner']);

  if p_role is null or not (p_role = any(array['owner','admin','support'])) then
    raise exception 'Geçersiz rol: %', coalesce(p_role, '(boş)') using errcode = '22023';
  end if;

  select u.id into v_user_id
  from auth.users u
  where lower(u.email::text) = lower(trim(p_email)) and u.deleted_at is null;

  if v_user_id is null then
    raise exception 'Bu e-postayla kayıtlı kullanıcı yok: %', p_email using errcode = 'P0002';
  end if;

  insert into public.admin_users (user_id, role, created_by)
  values (v_user_id, p_role, (select auth.uid()))
  on conflict (user_id) do update set role = excluded.role;

  return v_user_id;
end;
$fn$;

revoke execute on function public.admin_grant_role(text, text) from public, anon;
grant execute on function public.admin_grant_role(text, text) to authenticated;

create or replace function public.admin_revoke_role(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  perform public.admin_assert(array['owner']);

  -- Son owner'ı silmek paneli kimsenin yönetemediği bir duruma sokar.
  if (select a.role from public.admin_users a where a.user_id = p_user_id) = 'owner'
     and (select count(*) from public.admin_users where role = 'owner') <= 1 then
    raise exception 'Son sahip kaldırılamaz.' using errcode = '23514';
  end if;

  delete from public.admin_users where user_id = p_user_id;
end;
$fn$;

revoke execute on function public.admin_revoke_role(uuid) from public, anon;
grant execute on function public.admin_revoke_role(uuid) to authenticated;

/*
 * Yönetici listesi. admin_users yalnızca user_id tutuyor; e-posta
 * auth.users'ta ve istemcinin o tabloya erişimi yok.
 */
create or replace function public.admin_list_admins()
returns table (
  user_id         uuid,
  email           text,
  role            text,
  note            text,
  created_at      timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  perform public.admin_assert();

  return query
  select a.user_id, u.email::text, a.role, a.note, a.created_at, u.last_sign_in_at
  from public.admin_users a
  join auth.users u on u.id = a.user_id
  order by
    case a.role when 'owner' then 0 when 'admin' then 1 else 2 end,
    u.email;
end;
$fn$;

revoke execute on function public.admin_list_admins() from public, anon;
grant execute on function public.admin_list_admins() to authenticated;
