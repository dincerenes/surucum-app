-- Sürücüm — bulut şeması
-- Cihazdaki SQLite şemasının aynadaki hâli.
--   kuruş tutarları            -> bigint       (asla numeric/float)
--   business_date              -> date
--   created/updated/deleted_at -> bigint       (unix ms, istemciyle birebir)
--   server_updated_at          -> timestamptz  (yalnızca sunucuda üretilir)

create or replace function public.touch_server_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;  -- bayat yazma: satıra dokunma
  end if;
  new.server_updated_at := now();
  return new;
end;
$fn$;

create table public.app_settings (
  id                        uuid primary key,
  user_id                   uuid not null references auth.users(id) on delete cascade,
  created_at                bigint not null,
  updated_at                bigint not null,
  deleted_at                bigint,
  server_updated_at         timestamptz not null default now(),
  day_cutoff_hour           integer not null default 4 check (day_cutoff_hour between 0 and 23),
  default_vehicle_id        uuid,
  region_code               text not null default 'TR',
  default_earning_source_id uuid,
  onboarding_completed_at   bigint
);

create table public.vehicles (
  id                   uuid primary key,
  user_id              uuid not null references auth.users(id) on delete cascade,
  created_at           bigint not null,
  updated_at           bigint not null,
  deleted_at           bigint,
  server_updated_at    timestamptz not null default now(),
  label                text not null,
  plate                text,
  make                 text,
  model                text,
  model_year           integer,
  ownership            text not null default 'owned'
                       check (ownership in ('owned','rented_plate','rented_vehicle','employer')),
  initial_odometer_km  integer,
  is_active            boolean not null default true,
  sort_order           integer not null default 0,
  notes                text
);

create table public.vehicle_fuel_types (
  id                        uuid primary key,
  user_id                   uuid not null references auth.users(id) on delete cascade,
  created_at                bigint not null,
  updated_at                bigint not null,
  deleted_at                bigint,
  server_updated_at         timestamptz not null default now(),
  vehicle_id                uuid not null,
  fuel_type                 text not null
                            check (fuel_type in ('gasoline','diesel','lpg','cng','electric')),
  avg_consumption_per_100km integer,
  is_consumption_measured   boolean not null default false,
  last_unit_price_kurus     bigint,
  is_primary                boolean not null default false
);

create table public.earning_sources (
  id                     uuid primary key,
  user_id                uuid not null references auth.users(id) on delete cascade,
  created_at             bigint not null,
  updated_at             bigint not null,
  deleted_at             bigint,
  server_updated_at      timestamptz not null default now(),
  name                   text not null,
  default_commission_bps integer not null default 0 check (default_commission_bps between 0 and 10000),
  color_hex              text,
  is_active              boolean not null default true,
  sort_order             integer not null default 0
);

create table public.expense_categories (
  id                uuid primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,
  created_at        bigint not null,
  updated_at        bigint not null,
  deleted_at        bigint,
  server_updated_at timestamptz not null default now(),
  name              text not null,
  kind              text not null default 'variable' check (kind in ('variable','fixed')),
  icon              text,
  is_system         boolean not null default false,
  is_active         boolean not null default true,
  sort_order        integer not null default 0
);

create table public.shifts (
  id                 uuid primary key,
  user_id            uuid not null references auth.users(id) on delete cascade,
  created_at         bigint not null,
  updated_at         bigint not null,
  deleted_at         bigint,
  server_updated_at  timestamptz not null default now(),
  vehicle_id         uuid not null,
  started_at         bigint not null,
  ended_at           bigint,
  start_odometer_km  integer,
  end_odometer_km    integer,
  business_date      date not null,
  notes              text
);

create table public.rides (
  id                 uuid primary key,
  user_id            uuid not null references auth.users(id) on delete cascade,
  created_at         bigint not null,
  updated_at         bigint not null,
  deleted_at         bigint,
  server_updated_at  timestamptz not null default now(),
  shift_id           uuid,
  earning_source_id  uuid not null,
  vehicle_id         uuid,
  occurred_at        bigint not null,
  business_date      date not null,
  gross_amount_kurus bigint not null,
  commission_kurus   bigint not null default 0,
  net_amount_kurus   bigint not null,
  commission_bps     integer not null default 0 check (commission_bps between 0 and 10000),
  tip_kurus          bigint not null default 0,
  payment_method     text not null default 'app'
                     check (payment_method in ('cash','card','app','other')),
  distance_meters    integer,
  duration_seconds   integer,
  notes              text
);

create table public.expenses (
  id                uuid primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,
  created_at        bigint not null,
  updated_at        bigint not null,
  deleted_at        bigint,
  server_updated_at timestamptz not null default now(),
  category_id       uuid not null,
  vehicle_id        uuid,
  amount_kurus      bigint not null,
  occurred_at       bigint not null,
  business_date     date not null,
  receipt_path      text,
  notes             text
);

create table public.recurring_expenses (
  id                uuid primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,
  created_at        bigint not null,
  updated_at        bigint not null,
  deleted_at        bigint,
  server_updated_at timestamptz not null default now(),
  category_id       uuid not null,
  vehicle_id        uuid,
  name              text not null,
  amount_kurus      bigint not null,
  period            text not null default 'monthly'
                    check (period in ('daily','weekly','monthly','quarterly','yearly')),
  start_date        date not null,
  end_date          date,
  is_active         boolean not null default true,
  notes             text
);

create table public.fuel_logs (
  id                 uuid primary key,
  user_id            uuid not null references auth.users(id) on delete cascade,
  created_at         bigint not null,
  updated_at         bigint not null,
  deleted_at         bigint,
  server_updated_at  timestamptz not null default now(),
  vehicle_id         uuid not null,
  fuel_type          text not null
                     check (fuel_type in ('gasoline','diesel','lpg','cng','electric')),
  occurred_at        bigint not null,
  business_date      date not null,
  volume_per1000     integer not null,
  unit_price_kurus   bigint not null,
  total_amount_kurus bigint not null,
  odometer_km        integer,
  is_full_tank       boolean not null default true,
  station_name       text,
  receipt_path       text,
  notes              text
);

create table public.goals (
  id                uuid primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,
  created_at        bigint not null,
  updated_at        bigint not null,
  deleted_at        bigint,
  server_updated_at timestamptz not null default now(),
  period            text not null default 'daily' check (period in ('daily','weekly','monthly')),
  target_net_kurus  bigint not null,
  start_date        date not null,
  end_date          date,
  is_active         boolean not null default true
);

create table public.fuel_prices (
  id               uuid primary key default gen_random_uuid(),
  region_code      text not null,
  fuel_type        text not null
                   check (fuel_type in ('gasoline','diesel','lpg','cng','electric')),
  unit_price_kurus bigint not null,
  effective_date   date not null,
  source           text not null,
  fetched_at       bigint not null,
  unique (region_code, fuel_type, effective_date)
);
