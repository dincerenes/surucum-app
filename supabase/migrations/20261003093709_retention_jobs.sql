-- Zamanlanmış saklama süresi temizliği (pg_cron).
--
-- Her gün 01:17 UTC'de (04:17 İstanbul) tek iş, tek fonksiyon:
-- public.run_retention(). Silinenler:
--
--   admin_audit_log              1 yıldan eski   created_at
--   auth.audit_log_entries       1 yıldan eski   created_at  (giriş/IP kaydı;
--                                gizlilik politikası "en fazla 1 yıl" diyor)
--   account_deletions            3 yıldan eski   deleted_at  (Silme Yön. md. 7)
--   retention_runs               3 yıldan eski   ran_at      (bu işin kendi kaydı)
--   kullanıcı tablolarındaki yumuşak silinmiş satırlar — 85 gün (aşağıda)
--
-- ---------------------------------------------------------------------------
-- YUMUŞAK SİLİNEN SATIRLAR — Silme Yönetmeliği md. 11/3: silme yükümlülüğü
-- doğunca en geç 3 ay.
--
-- KAPSAM: eşitlenen ve satırı yumuşak silinebilen BÜTÜN kullanıcı
-- tabloları — app_settings DAHİL (ad, şehir, avatar taşıyor; mükerrer ayar
-- satırı yumuşak siliniyor):
--   app_settings, vehicles, vehicle_fuel_types, earning_sources,
--   expense_categories, shifts, rides, expenses, recurring_expenses,
--   fuel_logs, goals
-- (20260825113605_rls_and_indexes.sql'deki owned_tables listesiyle aynı.)
-- KAPSAM DIŞI: feedback (deleted_at yok, yalnızca ekleniyor), admin
-- tabloları, fuel_prices, terms_acceptances, account_deletions.
--
-- deleted_at'İN BİRİMİ: bigint, unix MİLİSANİYE (20260825113534_initial_schema.sql
-- başlığı: "created/updated/deleted_at -> bigint (unix ms, istemciyle
-- birebir)"). Timestamptz DEĞİL ve İSTEMCİ SAATİYLE yazılıyor.
--
-- KARAR — süre deleted_at'le DEĞİL, server_updated_at'le ölçülüyor;
-- deleted_at yalnızca "bu satır silindi" işareti olarak kullanılıyor:
--   * deleted_at cihaz saati. Saati ileride olan cihazın silme işareti hiç
--     "85 günlük" olmaz ve satır SONSUZA kadar kalırdı (yasal ihlal).
--     Saati geride olan cihazınki ise buluta ulaştığı gün silinir; öbür
--     cihazlar silindiğini hiç öğrenemez ve kayıt onlarda dirilirdi.
--   * server_updated_at sunucu saati ve silme işaretinin buluta YAZILDIĞI
--     an (touch_server_updated_at tetikleyicisi). Silinmiş satır bir daha
--     yazılmadığı için bu, buluttaki silinme zamanıdır.
-- Çevrimdışı silinip geç gönderilen satırın sayacı buluta ulaştığı gün
-- başlar: bulut ondan önce silindiğini bilemez.
-- İstemci tarafı (src/sync/retention.ts) aynı 85 günü cihaz saatiyle
-- sayıyor ve 60 günden uzun süre çekmemiş cihazı baştan indiriyor; bulut
-- işareti 85 gün tutunca 60 günde bir eşitlenen her cihaz onu görmüş olur.
--
-- KARAR — hâlâ CANLI bir satırın işaret ettiği silinmiş satır SİLİNMEZ.
-- Uygulama kazanç kaynağını silerken seferlerini bırakıyor (sefer kaynağın
-- adını gösteriyor); kaynak bulutta kalıcı silinseydi yeni telefona
-- baştan inen seferler var olmayan bir kaynağa bağlı kalırdı
-- (admin_system_health'in "yetim" denetimleri de bunu hata sayar).
-- Bağlar (yabancı anahtar yok, uygulama düzeyinde):
--   vehicles           ← shifts, rides, expenses, recurring_expenses,
--                        fuel_logs, vehicle_fuel_types (.vehicle_id),
--                        app_settings.default_vehicle_id
--   earning_sources    ← rides.earning_source_id,
--                        app_settings.default_earning_source_id
--   expense_categories ← expenses.category_id, recurring_expenses.category_id
--   shifts             ← rides, expenses, fuel_logs (.shift_id)
-- Çocuklar ebeveynden ÖNCE temizleniyor; vardiya silinince çocukları da
-- aynı anda silindiğinden ikisi aynı gün gider.
--
-- 85 GÜN: "3 ay" en kısa hâliyle 89 gün (31 Ocak → 30 Nisan) ve iş günde
-- bir çalışıyor; 90 gün olsaydı en kötü durumda süre 1–2 gün aşılırdı.
-- İstemcideki TOMBSTONE_KEEP_MS da AYNI değerde olmalı.
--
-- ---------------------------------------------------------------------------
-- auth.audit_log_entries — YETKİ SORUNU
--
-- Bu tablo Supabase Auth'un (sahibi supabase_auth_admin). Migration'lar ve
-- cron işi postgres rolüyle çalışıyor; postgres'in o tabloda DELETE yetkisi
-- platform sürümüne göre OLMAYABİLİR. Bu yüzden silme ayrı bir
-- `security definer` fonksiyonda (purge_auth_audit_log) ve run_retention
-- onu kendi alt bloğunda çağırıyor: yetki yoksa YALNIZCA o adım 42501 ile
-- başarısız olur, diğer temizlikler yine yapılır, retention_runs.ok = false
-- yazılır. Yetki şununla görülür:
--   select has_table_privilege('postgres', 'auth.audit_log_entries', 'delete');
-- false dönerse iki yol:
--   a) Panel → Authentication → ayarlarda auth denetim kaydının
--      VERİTABANINA yazılmasını kapatmak ("Disable audit logs in database"
--      / audit log'u yalnızca log akışına yazma). Kayıtlar o zaman yalnızca
--      Logs Explorer'da, planın log saklama süresi kadar durur; tabloda
--      kalan eski satırlar için yine bu fonksiyon ya da Supabase desteği
--      gerekir.
--   b) Supabase desteğinden postgres'e o tabloda DELETE yetkisi istemek.
--
-- ---------------------------------------------------------------------------
-- pg_cron
--
-- Supabase'de pg_cron pg_catalog'a kurulur ve işleri `cron` şemasında
-- tutar (Supabase belgelerindeki kurulum). İş adı sabit; aynı migration
-- yeniden çalıştırılırsa önce aynı adlı iş kaldırılıyor, ÇİFT İŞ OLUŞMAZ
-- (cron.schedule zaten aynı adı günceller; unschedule ek güvence).
-- İşin sahibi postgres; cron.job_run_details'te sonuç görünür. Fonksiyon
-- adım hatalarını YUTUP retention_runs'a yazdığı için iş "succeeded"
-- görünür — gerçek sonuç retention_runs.ok'ta.
--
-- ELLE ÇALIŞTIRMA: yalnızca postgres (SQL editörü) ve service_role.
--   select public.run_retention();
-- GERÇEKTEN SİLER. Önce kaç satırın gideceğine bakmak için (örnek):
--   select count(*) from public.rides
--    where deleted_at is not null and server_updated_at < now() - interval '85 days';
--
-- UYGULAMA SIRASI: 20261003093530_account_deletions.sql'den SONRA (onun
-- tablosunu temizliyor; run_retention plpgsql olduğu için tablo yoksa
-- kurulum geçer ama o adım her gün hata verir). 20261003093636'den sonra.
-- İstemcinin 60 gün/baştan indirme mantığı (src/sync/retention.ts) bu
-- migration'dan önce ya da aynı anda yayında olmalı; değilse 85 günden
-- uzun süre açılmamış eski sürümlü bir cihaz, bulutta kalıcı silinen
-- kaydı göstermeye devam eder (veri kaybı değil, yalnızca bayat görüntü).
--
-- ELLE DOĞRULAMA:
--   select jobid, jobname, schedule, command, active from cron.job
--    where jobname = 'surucum-retention';                      -- tek satır
--   select has_function_privilege('authenticated', 'public.run_retention()', 'execute'),  -- false
--          has_function_privilege('anon', 'public.run_retention()', 'execute'),           -- false
--          has_function_privilege('service_role', 'public.run_retention()', 'execute');   -- true
--   select public.run_retention();                              -- ilk elle koşu
--   select ran_at, ok, detail from public.retention_runs order by ran_at desc limit 5;
--   -- ertesi gün cron'un koştuğu:
--   select status, return_message, start_time from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'surucum-retention')
--    order by start_time desc limit 5;

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- ---------------------------------------------------------------------------
-- Temizlik işinin kendi kaydı
-- ---------------------------------------------------------------------------

/*
 * Silme Yönetmeliği md. 7, periyodik imhanın da kayıt altına alınmasını ve
 * kayıtların en az 3 yıl saklanmasını istiyor. admin_audit_log bir yılda
 * temizlendiği için oraya değil, buraya yazılıyor.
 * İçerik yalnızca tablo başına SAYI ve hata kodları — kişisel veri yok.
 */
create table public.retention_runs (
  id     bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  ok     boolean not null,
  detail jsonb not null default '{}'::jsonb
);

create index retention_runs_ran_at_idx on public.retention_runs (ran_at);

alter table public.retention_runs enable row level security;

create policy "retention_runs_select_admin" on public.retention_runs
  for select to authenticated
  using (public.has_admin_role(array['owner','admin']));

revoke all on table public.retention_runs from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.retention_runs from authenticated;

-- ---------------------------------------------------------------------------
-- auth denetim kaydı
-- ---------------------------------------------------------------------------

/*
 * auth.audit_log_entries'ten bir yıldan eski satırları siler, sayısını döner.
 * Parametresiz: süre burada sabit, çağıran "her şeyi sil" diyemez.
 * Yetki yoksa 42501 fırlatır; run_retention bunu yakalar.
 *
 * plpgsql gövdesi oluşturulurken tabloya erişilmiyor; yetki sorunu kurulumu
 * değil, yalnızca çalışmayı etkiler.
 */
create or replace function public.purge_auth_audit_log()
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_count bigint;
begin
  delete from auth.audit_log_entries a
   where a.created_at < now() - interval '1 year';
  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

-- Yalnızca run_retention (ve sahibi postgres) çağırır.
revoke execute on function public.purge_auth_audit_log()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- run_retention
-- ---------------------------------------------------------------------------

/*
 * Bütün saklama süresi temizliği. Her adım kendi alt bloğunda: bir adımın
 * hatası (ör. auth yetkisi) öbürlerini geri almaz. Sonuç retention_runs'a
 * yazılır ve döndürülür; adım başarısızsa ayrıca WARNING düşer.
 *
 * Silinen satırların tetikleyicisi yok: touch_server_updated_at yalnızca
 * INSERT/UPDATE'te, admin denetim tetikleyicileri yalnızca yönetim
 * tablolarında.
 */
create or replace function public.run_retention()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  -- Süreler tek yerde. Yumuşak silme süresi src/sync/retention.ts'teki
  -- TOMBSTONE_KEEP_MS ile aynı olmalı.
  v_tombstone_age interval := interval '85 days';
  v_audit_age     interval := interval '1 year';
  v_evidence_age  interval := interval '3 years';

  v_now     timestamptz := now();
  v_ok      boolean := true;
  v_detail  jsonb := '{}'::jsonb;
  v_purged  jsonb := '{}'::jsonb;
  v_count   bigint;
  v_table   text;
  v_ref     text;
  v_guard   text;

  -- Çocuklar önce: aynı koşuda ebeveynin önü açılsın.
  v_tables text[] := array[
    'rides', 'expenses', 'fuel_logs', 'recurring_expenses', 'goals',
    'vehicle_fuel_types', 'app_settings',
    'shifts', 'earning_sources', 'expense_categories', 'vehicles'
  ];

  -- 'ebeveyn:çocuk:sütun' — canlı çocuk satırı varken ebeveyn silinmez.
  v_refs text[] := array[
    'vehicles:shifts:vehicle_id',
    'vehicles:rides:vehicle_id',
    'vehicles:expenses:vehicle_id',
    'vehicles:recurring_expenses:vehicle_id',
    'vehicles:fuel_logs:vehicle_id',
    'vehicles:vehicle_fuel_types:vehicle_id',
    'vehicles:app_settings:default_vehicle_id',
    'earning_sources:rides:earning_source_id',
    'earning_sources:app_settings:default_earning_source_id',
    'expense_categories:expenses:category_id',
    'expense_categories:recurring_expenses:category_id',
    'shifts:rides:shift_id',
    'shifts:expenses:shift_id',
    'shifts:fuel_logs:shift_id'
  ];
begin
  -- 1. Yönetim denetim kaydı
  begin
    delete from public.admin_audit_log l where l.created_at < v_now - v_audit_age;
    get diagnostics v_count = row_count;
    v_detail := v_detail || jsonb_build_object('admin_audit_log', v_count);
  exception when others then
    v_ok := false;
    v_detail := v_detail || jsonb_build_object('admin_audit_log',
      jsonb_build_object('error', sqlstate, 'message', sqlerrm));
  end;

  -- 2. Auth denetim kaydı (yetki olmayabilir — bkz. başlık)
  begin
    v_count := public.purge_auth_audit_log();
    v_detail := v_detail || jsonb_build_object('auth_audit_log_entries', v_count);
  exception when others then
    v_ok := false;
    v_detail := v_detail || jsonb_build_object('auth_audit_log_entries',
      jsonb_build_object('error', sqlstate, 'message', sqlerrm));
  end;

  -- 3. Silme kanıtları
  begin
    delete from public.account_deletions d where d.deleted_at < v_now - v_evidence_age;
    get diagnostics v_count = row_count;
    v_detail := v_detail || jsonb_build_object('account_deletions', v_count);
  exception when others then
    v_ok := false;
    v_detail := v_detail || jsonb_build_object('account_deletions',
      jsonb_build_object('error', sqlstate, 'message', sqlerrm));
  end;

  -- 4. Bu işin eski kayıtları
  begin
    delete from public.retention_runs x where x.ran_at < v_now - v_evidence_age;
    get diagnostics v_count = row_count;
    v_detail := v_detail || jsonb_build_object('retention_runs', v_count);
  exception when others then
    v_ok := false;
    v_detail := v_detail || jsonb_build_object('retention_runs',
      jsonb_build_object('error', sqlstate, 'message', sqlerrm));
  end;

  -- 5. Yumuşak silinmiş kullanıcı satırları. Tablo ve sütun adları
  --    yukarıdaki SABİT dizilerden geliyor, %I ile tırnaklanıyor; dışarıdan
  --    hiçbir metin SQL'e girmiyor.
  foreach v_table in array v_tables loop
    v_guard := '';
    foreach v_ref in array v_refs loop
      if split_part(v_ref, ':', 1) = v_table then
        v_guard := v_guard || format(
          ' and not exists (select 1 from public.%I c'
          || ' where c.user_id = p.user_id and c.%I = p.id and c.deleted_at is null)',
          split_part(v_ref, ':', 2), split_part(v_ref, ':', 3)
        );
      end if;
    end loop;

    begin
      execute format(
        'delete from public.%I p where p.deleted_at is not null'
        || ' and p.server_updated_at < $1%s',
        v_table, v_guard
      ) using v_now - v_tombstone_age;
      get diagnostics v_count = row_count;
      v_purged := v_purged || jsonb_build_object(v_table, v_count);
    exception when others then
      v_ok := false;
      v_purged := v_purged || jsonb_build_object(v_table,
        jsonb_build_object('error', sqlstate, 'message', sqlerrm));
    end;
  end loop;

  v_detail := v_detail || jsonb_build_object('soft_deleted', v_purged);

  insert into public.retention_runs (ran_at, ok, detail) values (v_now, v_ok, v_detail);

  if not v_ok then
    raise warning 'run_retention: en az bir adım başarısız — %', v_detail::text;
  end if;

  return jsonb_build_object('ok', v_ok, 'ran_at', v_now) || v_detail;
end;
$fn$;

revoke execute on function public.run_retention() from public, anon, authenticated;
grant execute on function public.run_retention() to service_role;

-- ---------------------------------------------------------------------------
-- Zamanlama — idempotent
-- ---------------------------------------------------------------------------

do $do$
begin
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'surucum-retention';
end;
$do$;

select cron.schedule(
  'surucum-retention',
  '17 1 * * *',
  $cmd$select public.run_retention()$cmd$
);
