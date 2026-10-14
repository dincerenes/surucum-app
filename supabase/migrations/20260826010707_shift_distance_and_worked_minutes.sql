alter table public.shifts
  add column if not exists distance_km integer,
  add column if not exists worked_minutes integer;
