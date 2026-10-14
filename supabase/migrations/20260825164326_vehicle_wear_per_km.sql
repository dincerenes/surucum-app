alter table public.vehicles
  add column if not exists wear_per_km_kurus bigint not null default 300;
