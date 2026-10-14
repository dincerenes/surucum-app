-- Satır bazlı güvenlik, senkron tetikleyicileri ve index'ler.
--
-- Politikalarda auth.uid() DOĞRUDAN DEĞİL, (select auth.uid()) olarak yazılıyor.
-- Sarmalanmadığında Postgres bu çağrıyı her satır için yeniden değerlendirir;
-- select içine alındığında bir kez hesaplanıp önbelleğe alınır.

do $do$
declare
  t text;
  owned_tables text[] := array[
    'app_settings', 'vehicles', 'vehicle_fuel_types', 'earning_sources',
    'expense_categories', 'shifts', 'rides', 'expenses',
    'recurring_expenses', 'fuel_logs', 'goals'
  ];
begin
  foreach t in array owned_tables loop

    execute format('alter table public.%I enable row level security', t);

    execute format(
      'create policy "%1$s_select_own" on public.%1$I for select to authenticated using ((select auth.uid()) = user_id)', t);

    execute format(
      'create policy "%1$s_insert_own" on public.%1$I for insert to authenticated with check ((select auth.uid()) = user_id)', t);

    execute format(
      'create policy "%1$s_update_own" on public.%1$I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);

    -- Silme politikası var ama uygulama kullanmaz: silme yumuşaktır,
    -- deleted_at damgalanır. Sert silme senkronda kaydı diriltir.
    execute format(
      'create policy "%1$s_delete_own" on public.%1$I for delete to authenticated using ((select auth.uid()) = user_id)', t);

    -- Sunucu damgası + bayat yazma reddi
    execute format(
      'create trigger %1$s_touch before insert or update on public.%1$I for each row execute function public.touch_server_updated_at()', t);

    -- RLS her sorguya user_id filtresi eklediğinden bu index zorunlu.
    execute format('create index %1$s_user_id_idx on public.%1$I (user_id)', t);

    -- Artımlı çekmenin imleci.
    execute format('create index %1$s_pull_idx on public.%1$I (user_id, server_updated_at)', t);

  end loop;
end;
$do$;

create index shifts_business_date_idx     on public.shifts (user_id, business_date);
create index rides_business_date_idx      on public.rides (user_id, business_date);
create index rides_shift_idx              on public.rides (shift_id);
create index rides_source_idx             on public.rides (earning_source_id);
create index expenses_business_date_idx   on public.expenses (user_id, business_date);
create index expenses_category_idx        on public.expenses (category_id);
create index fuel_logs_business_date_idx  on public.fuel_logs (user_id, business_date);
create index fuel_logs_vehicle_idx        on public.fuel_logs (vehicle_id, occurred_at);

-- fuel_prices: ortak referans verisi. Herkes okur, hiçbir istemci yazamaz.
-- Yazma yalnızca service_role ile (RLS'i baypas eder) — yani fiyatları
-- sadece zamanlanmış Edge Function güncelleyebilir.
alter table public.fuel_prices enable row level security;

create policy "fuel_prices_read_all" on public.fuel_prices
  for select to authenticated, anon
  using (true);

create index fuel_prices_lookup_idx
  on public.fuel_prices (region_code, fuel_type, effective_date desc);
