-- Yönetim erişimlerinin kayda geçmesi (2 Ekim 2026 yasal inceleme).
--
-- Üç değişiklik, bir ekleme:
--
-- 1. admin_user_list artık her çağrıda admin_audit_log'a yazıyor.
--    Eski yorum "liste her sayfa yenilemede çağrılır, loglamak gürültü"
--    diyordu. Ama liste her sürücünün e-postasını, son etkinliğini ve net
--    kazancını gösteriyor; "kim, ne zaman, kimin verisini gördü" sorusunun
--    cevabı bu çağrı olmadan eksik. Gürültü kabul edilen bedel; kayıt bir
--    yıl sonra 20261003093709_retention_jobs.sql ile siliniyor.
--    VOLATILE oldu (stable değildi): denetim satırı yazıyor. PostgREST
--    volatile fonksiyonu yalnızca POST ile çağırır — supabase-js `.rpc()`
--    varsayılanı zaten POST; `{ get: true }` kullanan bir çağrı varsa
--    salt-okur işlemde yazamayıp hata verir.
--
-- 2. 'support' rolü listede PARA görmüyor: net_total_kurus support için
--    NULL dönüyor, 'net' sıralaması support için açılış tarihine düşüyor
--    (sıralama da sıralamayı sızdırırdı). Fonksiyondan support'u tamamen
--    çıkarmak yerine bu seçildi: destek, kullanıcıyı e-postasıyla bulmak
--    için listeye muhtaç; dönüş tipi aynı kaldığı için imza da değişmiyor,
--    panelde yalnızca sütun boş görünür.
--
-- 3. admin_user_records yumuşak silinmiş satırları varsayılan olarak
--    DÖNDÜRMÜYOR. Sürücünün sildiği kayıt yalnızca eşitleme için (silme
--    işareti) duruyor; yöneticinin onu açması o amacın dışında. Yeni
--    p_include_deleted parametresi YALNIZCA 'owner' içindir (senkron hatası
--    ayıklama) ve kullanıldığı denetim satırına yazılır. İmza değiştiği için
--    eski fonksiyon DÜŞÜRÜLÜP yeniden yaratılıyor: create or replace yeni
--    parametreyle ikinci bir aşırı yükleme yaratırdı ve 4 argümanlı çağrı
--    "function is not unique" hatasıyla belirsiz kalırdı.
--
-- 4. admin_feedback_list (yeni): geri bildirimleri okuyan, her çağrıyı
--    kayda geçiren tek yol. Geri bildirim metni serbest metin; sürücü
--    içine kişisel bilgi yazabiliyor. owner/admin/support okur. E-posta
--    DÖNMEZ — gerekiyorsa user_id ile admin_user_detail açılır (o da
--    loglanıyor).
--    NOT: Supabase panelinin Table Editor'ü postgres rolüyle okur ve buraya
--    düşmez. docs/mimari.md'deki "Table Editor → feedback" yolu bu
--    fonksiyon panele bağlanınca bırakılmalı.
--
-- UYGULAMA SIRASI: 20261003093530_account_deletions.sql'den sonra,
-- 20261003093709_retention_jobs.sql'den önce (bağımsız; sıra yalnızca
-- paketin tutarlılığı için). Yönetim paneli kodu ayrı dalda: panel
-- admin_user_records'u 4 argümanla çağırıyorsa çalışmaya devam eder
-- (yeni parametrenin varsayılanı var).
--
-- ELLE DOĞRULAMA:
--   -- üçü de 'v' (volatile) olmalı; admin_user_records tek bir imzayla
--   select p.proname, p.provolatile, pg_get_function_identity_arguments(p.oid)
--     from pg_proc p
--    where p.pronamespace = 'public'::regnamespace
--      and p.proname in ('admin_user_list', 'admin_user_records', 'admin_feedback_list');
--   -- support gözüyle deneme (geri alınır, denetim satırı da kalmaz):
--   begin;
--     select set_config('request.jwt.claims', '{"sub":"<support-uuid>","role":"authenticated"}', true);
--     set local role authenticated;
--     select email, net_total_kurus from public.admin_user_list() limit 3;  -- net boş
--     select action, detail->>'returned' from public.admin_audit_log
--      order by id desc limit 1;                                              -- user_list_view
--   rollback;

-- ---------------------------------------------------------------------------
-- 1–2. Kullanıcı listesi
-- ---------------------------------------------------------------------------

/*
 * Kullanıcı listesi. PARA TOPLAMI döner (support hariç) ama seferin
 * kendisini DÖNMEZ. Her çağrı denetim kaydına düşer: arama metni, sayfa,
 * sıralama ve dönen kullanıcı kimlikleri ile.
 *
 * Arama metni kayda BİLEREK yazılıyor: bir e-posta olabilir, ama "bu
 * sürücüyü kim aradı" sorusunun tek cevabı o. Kayıt bir yıl tutuluyor.
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
volatile
security definer
set search_path = ''
as $fn$
declare
  v_limit  integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_search text    := nullif(trim(coalesce(p_search, '')), '');
  v_sort   text    := coalesce(p_sort, 'created_at');
  v_money  boolean;
  v_ids    uuid[]  := array[]::uuid[];
  v_total  bigint  := 0;
  rec      record;
begin
  perform public.admin_assert();

  -- Para yalnızca ham veri açabilen rollere. support için toplam hiç
  -- HESAPLANMIYOR (yalnızca gizlenmiyor), sıralama da ona göre düşüyor.
  v_money := public.has_admin_role(array['owner','admin']);
  if not v_money and v_sort = 'net' then
    v_sort := 'created_at';
  end if;

  for rec in
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
        case when v_money then
          (select coalesce(sum(r.net_amount_kurus), 0)::bigint from public.rides r
             where r.user_id = u.id and r.deleted_at is null)
        end                                                                                     as net_total_kurus,
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
      b.id                       as o_user_id,
      b.email                    as o_email,
      b.created_at               as o_created_at,
      b.last_sign_in_at          as o_last_sign_in_at,
      b.confirmed                as o_confirmed,
      coalesce(b.banned, false)  as o_banned,
      b.admin_role               as o_admin_role,
      b.vehicle_count            as o_vehicle_count,
      b.ride_count               as o_ride_count,
      b.last_activity_at         as o_last_activity_at,
      b.net_total_kurus          as o_net_total_kurus,
      count(*) over ()           as o_total_count
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
    limit v_limit offset v_offset
  loop
    user_id          := rec.o_user_id;
    email            := rec.o_email;
    created_at       := rec.o_created_at;
    last_sign_in_at  := rec.o_last_sign_in_at;
    confirmed        := rec.o_confirmed;
    banned           := rec.o_banned;
    admin_role       := rec.o_admin_role;
    vehicle_count    := rec.o_vehicle_count;
    ride_count       := rec.o_ride_count;
    last_activity_at := rec.o_last_activity_at;
    net_total_kurus  := rec.o_net_total_kurus;
    total_count      := rec.o_total_count;
    v_ids   := v_ids || rec.o_user_id;
    v_total := rec.o_total_count;
    return next;
  end loop;

  perform public.log_admin_action(
    'user_list_view', 'user_list', null,
    jsonb_build_object(
      'search', v_search,
      'sort', v_sort,
      'limit', v_limit,
      'offset', v_offset,
      'money_visible', v_money,
      'total', v_total,
      'returned', coalesce(array_length(v_ids, 1), 0),
      'user_ids', to_jsonb(v_ids)
    )
  );
end;
$fn$;

revoke execute on function public.admin_user_list(text, integer, integer, text) from public, anon;
grant execute on function public.admin_user_list(text, integer, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Ham kayıtlar — yumuşak silinenler varsayılan olarak dışarıda
-- ---------------------------------------------------------------------------

drop function if exists public.admin_user_records(uuid, text, integer, integer);

/*
 * Bir kullanıcının ham satırlarını döner. Panelin en hassas ucu.
 * Dört koruma: rol denetimi ('support' giremez), tablo adı beyaz listesi,
 * yumuşak silinmiş satırların varsayılan olarak gizlenmesi (açmak yalnızca
 * 'owner'), ve her çağrının denetim kaydına düşmesi.
 */
create or replace function public.admin_user_records(
  p_user_id         uuid,
  p_table           text,
  p_limit           integer default 100,
  p_offset          integer default 0,
  p_include_deleted boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_allowed text[] := array[
    'app_settings', 'vehicles', 'vehicle_fuel_types', 'earning_sources',
    'expense_categories', 'shifts', 'rides', 'expenses',
    'recurring_expenses', 'fuel_logs', 'goals'
  ];
  v_limit   integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_offset  integer := greatest(coalesce(p_offset, 0), 0);
  v_deleted boolean := coalesce(p_include_deleted, false);
  v_filter  text;
  v_rows    jsonb;
  v_total   bigint;
begin
  perform public.admin_assert(array['owner','admin']);

  if v_deleted then
    perform public.admin_assert(array['owner']);
  end if;

  if p_table is null or not (p_table = any(v_allowed)) then
    raise exception 'Geçersiz tablo: %', coalesce(p_table, '(boş)') using errcode = '22023';
  end if;

  -- Sabit metin; istemciden gelen hiçbir şey SQL'e eklenmiyor.
  v_filter := case when v_deleted then '' else ' and deleted_at is null' end;

  execute format('select count(*) from public.%I where user_id = $1%s', p_table, v_filter)
    into v_total using p_user_id;

  execute format(
    'select coalesce(jsonb_agg(t), ''[]''::jsonb) from ('
    || 'select * from public.%I where user_id = $1%s '
    || 'order by server_updated_at desc limit $2 offset $3) t',
    p_table, v_filter
  ) into v_rows using p_user_id, v_limit, v_offset;

  perform public.log_admin_action(
    'user_records_view', 'user', p_user_id::text,
    jsonb_build_object(
      'table', p_table, 'limit', v_limit, 'offset', v_offset,
      'include_deleted', v_deleted
    )
  );

  return jsonb_build_object(
    'table', p_table, 'total', v_total, 'include_deleted', v_deleted, 'rows', v_rows
  );
end;
$fn$;

revoke execute on function public.admin_user_records(uuid, text, integer, integer, boolean) from public, anon;
grant execute on function public.admin_user_records(uuid, text, integer, integer, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Geri bildirim okuma
-- ---------------------------------------------------------------------------

/*
 * Geri bildirim listesi, en yeni önce. p_status boşsa hepsi.
 * Her çağrı denetim kaydına dönen geri bildirim kimlikleriyle düşer.
 */
create or replace function public.admin_feedback_list(
  p_status text default null,
  p_limit  integer default 50,
  p_offset integer default 0
)
returns table (
  id          uuid,
  user_id     uuid,
  created_at  timestamptz,
  category    text,
  message     text,
  app_version text,
  platform    text,
  status      text,
  total_count bigint
)
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_limit  integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_status text    := nullif(trim(coalesce(p_status, '')), '');
  v_ids    uuid[]  := array[]::uuid[];
  v_total  bigint  := 0;
  rec      record;
begin
  perform public.admin_assert(array['owner','admin','support']);

  if v_status is not null and not (v_status = any(array['yeni','okundu','cozuldu'])) then
    raise exception 'Geçersiz durum: %', v_status using errcode = '22023';
  end if;

  -- Çıkış sütunlarıyla (id, user_id, status…) çakışmasın diye her sütun
  -- tablo takma adıyla ve o_ önekli adla okunuyor.
  for rec in
    select
      f.id            as o_id,
      f.user_id       as o_user_id,
      f.created_at    as o_created_at,
      f.category      as o_category,
      f.message       as o_message,
      f.app_version   as o_app_version,
      f.platform      as o_platform,
      f.status        as o_status,
      count(*) over () as o_total_count
    from public.feedback f
    where v_status is null or f.status = v_status
    order by f.created_at desc, f.id
    limit v_limit offset v_offset
  loop
    id          := rec.o_id;
    user_id     := rec.o_user_id;
    created_at  := rec.o_created_at;
    category    := rec.o_category;
    message     := rec.o_message;
    app_version := rec.o_app_version;
    platform    := rec.o_platform;
    status      := rec.o_status;
    total_count := rec.o_total_count;
    v_ids   := v_ids || rec.o_id;
    v_total := rec.o_total_count;
    return next;
  end loop;

  perform public.log_admin_action(
    'feedback_list_view', 'feedback', null,
    jsonb_build_object(
      'status', v_status,
      'limit', v_limit,
      'offset', v_offset,
      'total', v_total,
      'returned', coalesce(array_length(v_ids, 1), 0),
      'feedback_ids', to_jsonb(v_ids)
    )
  );
end;
$fn$;

revoke execute on function public.admin_feedback_list(text, integer, integer) from public, anon;
grant execute on function public.admin_feedback_list(text, integer, integer) to authenticated;
