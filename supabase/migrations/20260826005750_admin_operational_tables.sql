-- Operasyon tabloları: duyurular, özellik bayrakları, yakıt fiyatı yazma yetkisi.
--
-- Bu üç şey panelin dekoratif olmaktan çıktığı yer. Panelde bir bayrağı
-- kapatmak gerçekten uygulamadaki özelliği kapatır; bir duyuru yayımlamak
-- gerçekten sürücünün ekranında görünür.

create or replace function public.touch_admin_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

revoke execute on function public.touch_admin_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Duyurular
-- ---------------------------------------------------------------------------

/*
 * Sürücüye gösterilecek duyuru.
 *
 * Zaman penceresi (starts_at/ends_at) ve is_active AYRI tutuluyor:
 * "planlanmış ama henüz başlamamış" ile "elle kapatılmış" farklı
 * durumlar. Biri diğerinin yerine kullanılırsa, ileri tarihli bir duyuruyu
 * iptal etmek için tarihini kurcalamak gerekir ve kayıt kendini açıklamaz.
 */
create table public.announcements (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (length(trim(title)) > 0),
  body            text not null check (length(trim(body)) > 0),
  severity        text not null default 'info'
                  check (severity in ('info','warning','critical')),
  platform        text not null default 'all'
                  check (platform in ('all','ios','android')),

  -- Boşsa sürüm ayrımı yok. Doluysa yalnızca bu sürüm ve üstü görür —
  -- "yeni sürüme geçin" duyurusunun zaten geçmiş kullanıcıya gitmemesi için.
  min_app_version text,

  starts_at       timestamptz not null default now(),
  ends_at         timestamptz,
  is_active       boolean not null default true,

  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  check (ends_at is null or ends_at > starts_at)
);

create index announcements_live_idx on public.announcements (is_active, starts_at desc);

alter table public.announcements enable row level security;

-- Sürücü YALNIZCA yayında olanı görür. Taslak ve süresi geçmiş duyurular
-- istemciye hiç inmez — filtreleme istemciye bırakılırsa, henüz
-- yayımlanmamış bir duyuru ağ trafiğinde okunabilir hâle gelir.
create policy "announcements_read_live" on public.announcements
  for select to authenticated
  using (
    is_active
    and starts_at <= now()
    and (ends_at is null or ends_at > now())
  );

-- Admin hepsini görür (iki permissive politika VEYA'lanır).
create policy "announcements_read_admin" on public.announcements
  for select to authenticated
  using (public.is_admin());

create policy "announcements_insert_admin" on public.announcements
  for insert to authenticated
  with check (public.has_admin_role(array['owner','admin']));

create policy "announcements_update_admin" on public.announcements
  for update to authenticated
  using (public.has_admin_role(array['owner','admin']))
  with check (public.has_admin_role(array['owner','admin']));

create policy "announcements_delete_admin" on public.announcements
  for delete to authenticated
  using (public.has_admin_role(array['owner','admin']));

create trigger announcements_touch
  before update on public.announcements
  for each row execute function public.touch_admin_updated_at();

create trigger announcements_audit
  after insert or update or delete on public.announcements
  for each row execute function public.audit_admin_change();

-- ---------------------------------------------------------------------------
-- Özellik bayrakları
-- ---------------------------------------------------------------------------

/*
 * Uzaktan özellik anahtarı. src/lib/entitlements.ts'teki FEATURES listesiyle
 * birebir aynı anahtarları taşır.
 *
 * rollout_percent kademeli açılış içindir. Yüzde hesabı SUNUCUDA değil
 * cihazda yapılır: kullanıcı kimliğinin sabit bir özeti alınır, böylece
 * aynı kullanıcı her açılışta aynı kovaya düşer. Rastgele sayı kullanılsaydı
 * özellik kullanıcının gözünde açılıp kapanırdı.
 */
create table public.feature_flags (
  key             text primary key,
  description     text not null default '',
  is_enabled      boolean not null default false,
  rollout_percent integer not null default 100 check (rollout_percent between 0 and 100),
  updated_by      uuid references auth.users(id) on delete set null,
  updated_at      timestamptz not null default now()
);

alter table public.feature_flags enable row level security;

-- Bayraklar sır değil: istemci hepsini okur, kendi durumunu hesaplar.
create policy "feature_flags_read_all" on public.feature_flags
  for select to authenticated
  using (true);

create policy "feature_flags_insert_admin" on public.feature_flags
  for insert to authenticated
  with check (public.has_admin_role(array['owner','admin']));

create policy "feature_flags_update_admin" on public.feature_flags
  for update to authenticated
  using (public.has_admin_role(array['owner','admin']))
  with check (public.has_admin_role(array['owner','admin']));

create policy "feature_flags_delete_admin" on public.feature_flags
  for delete to authenticated
  using (public.has_admin_role(array['owner','admin']));

create trigger feature_flags_touch
  before update on public.feature_flags
  for each row execute function public.touch_admin_updated_at();

create trigger feature_flags_audit
  after insert or update or delete on public.feature_flags
  for each row execute function public.audit_admin_change();

-- v1'de uygulama tamamen ücretsiz: hepsi açık başlar.
insert into public.feature_flags (key, description, is_enabled) values
  ('unlimitedHistory', '30 günden eski kayıtlara erişim',        true),
  ('advancedReports',  'Kârlılık ısı haritası, kaynak karşılaştırma', true),
  ('export',           'Excel / PDF dışa aktarım',                true),
  ('cloudBackup',      'Bulut yedek ve cihaz değiştirme',         true),
  ('multiVehicle',     'Birden fazla araç',                       true);

-- ---------------------------------------------------------------------------
-- Yakıt fiyatları — yazma yetkisi
-- ---------------------------------------------------------------------------
--
-- İlk şemada fuel_prices'a HİÇBİR istemci yazamıyordu; yalnızca service_role
-- ile çalışan Edge Function yazabiliyordu. Bu, cron bir gün çektiğinde
-- fiyatı elle düzeltmenin yolu olmadığı anlamına geliyordu. Panel bunu
-- çözüyor: admin elle fiyat girebilir ve düzeltebilir.

create policy "fuel_prices_insert_admin" on public.fuel_prices
  for insert to authenticated
  with check (public.has_admin_role(array['owner','admin']));

create policy "fuel_prices_update_admin" on public.fuel_prices
  for update to authenticated
  using (public.has_admin_role(array['owner','admin']))
  with check (public.has_admin_role(array['owner','admin']));

create policy "fuel_prices_delete_admin" on public.fuel_prices
  for delete to authenticated
  using (public.has_admin_role(array['owner','admin']));

create trigger fuel_prices_audit
  after insert or update or delete on public.fuel_prices
  for each row execute function public.audit_admin_change();
