/**
 * Kanonik veri şeması.
 *
 * Bu dosya hem uygulamanın hem `drizzle-kit generate` komutunun tek
 * kaynağıdır. Şema değişince `npm run db:generate` çalıştırılmalı ve
 * üretilen `drizzle/` klasörünün TAMAMI sürüm kontrolüne girmelidir.
 */

export * from './_shared';
export * from './vehicles';
export * from './earnings';
export * from './expenses';
export * from './fuel';
export * from './system';

import { vehicles, vehicleFuelTypes } from './vehicles';
import { earningSources, shifts, rides } from './earnings';
import { expenseCategories, expenses, recurringExpenses } from './expenses';
import { fuelLogs, fuelPrices } from './fuel';
import { appSettings, devicePrefs, goals, outbox, syncRecoverySeen, syncState } from './system';

/**
 * Buluta senkronlanan tablolar, YABANCI ANAHTAR SIRASIYLA.
 *
 * Ebeveyn kayıt çocuğundan önce gönderilmeli: vardiyası sunucuda olmayan
 * bir sefer gönderilirse yabancı anahtar reddedilir. Senkron işçisi
 * kuyruğu bu sıraya göre gruplar.
 */
export const SYNC_TABLE_ORDER = [
  'app_settings',
  'vehicles',
  'vehicle_fuel_types',
  'earning_sources',
  'expense_categories',
  'shifts',
  'rides',
  'expenses',
  'recurring_expenses',
  'fuel_logs',
  'goals',
] as const;

export type SyncTableName = (typeof SYNC_TABLE_ORDER)[number];

/** Tablo adından Drizzle tablo nesnesine — senkron işçisi bunu kullanır. */
export const SYNC_TABLES = {
  app_settings: appSettings,
  vehicles,
  vehicle_fuel_types: vehicleFuelTypes,
  earning_sources: earningSources,
  expense_categories: expenseCategories,
  shifts,
  rides,
  expenses,
  recurring_expenses: recurringExpenses,
  fuel_logs: fuelLogs,
  goals,
} as const;

/** Senkronlanmayan tablolar — referans veri veya yerel defter. */
export const LOCAL_ONLY_TABLES = {
  fuel_prices: fuelPrices,
  outbox,
  sync_state: syncState,
  sync_recovery_seen: syncRecoverySeen,
  device_prefs: devicePrefs,
} as const;
