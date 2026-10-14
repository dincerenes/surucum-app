-- Yıpranma payının girdileri — kurulum sihirbazı soruyor, katsayı
-- (wear_per_km_kurus) bunlardan hesaplanıyor. Hepsi boş olabilir:
-- bilmeyen sürücü atlıyor, o kalem varsayılandan geliyor.
alter table public.vehicles
  add column transmission text check (transmission in ('manual', 'automatic')),
  add column maintenance_interval_km integer check (maintenance_interval_km between 1 and 1000000),
  add column maintenance_cost_kurus bigint check (maintenance_cost_kurus between 0 and 100000000000),
  add column tire_interval_km integer check (tire_interval_km between 1 and 1000000),
  add column tire_cost_kurus bigint check (tire_cost_kurus between 0 and 100000000000),
  add column market_value_kurus bigint check (market_value_kurus between 0 and 1000000000000),
  add column has_accident_record boolean;
