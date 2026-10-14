/**
 * Silinen kayıtların ömrü — cihaz tarafı.
 *
 * Yumuşak silinen satır (`deleted_at` dolu) eşitleme için bir süre
 * tutuluyor: öbür cihazlar silindiğini ancak bu işaretten öğreniyor.
 * Sonsuza kadar tutmak ise kullanıcının sildiği kaydın içeriğini hesap
 * kapanana kadar saklamak demekti. KVKK Silme Yönetmeliği md. 11/3:
 * silme yükümlülüğü doğunca en geç 3 ay.
 *
 * Bulut, `TOMBSTONE_KEEP_MS`'ten önce silinmiş satırları her gün kalıcı
 * siliyor (`run_retention`, supabase/migrations). Orada süre sunucu
 * saatiyle (`server_updated_at`) ölçülüyor, burada cihazınkiyle — burada
 * erken silinen bir işaret zararsız: kayıt zaten bulutta silinmiş, cihaz
 * baştan indirirse işaret yeniden iner ve yine silinir. Burada iki iş var:
 *
 * 1. Cihazdaki eski silme işaretlerini de silmek — yalnızca buluta
 *    gitmiş olanları (kuyrukta bekleyen işaret henüz bulutta değil).
 * 2. Uzun süre senkron olmamış cihazı baştan indirmeye yönlendirmek.
 *    Böyle bir cihaz, bulut işareti kalıcı sildikten sonra döndüğünde
 *    silindiğini hiç öğrenemez; kaydı sonsuza kadar gösterirdi. Eşik
 *    bulutun süresinden KISA: cihaz saatindeki kayma pay bırakılıyor.
 *
 * Baştan indirmede kuyrukta bekleyen satırlara dokunulmuyor: onlar bu
 * cihazın henüz gönderemediği değişiklikler.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { readState, resetPullCursor, writeState } from './state';
import { SYNC_TABLES, type SyncTable } from './tables';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Bulutun silme işaretini tuttuğu süre — migration'daki süreyle aynı.
 * 90 değil: "3 ay" en kısa hâliyle 89 gün ve temizlik günde bir çalışıyor.
 */
export const TOMBSTONE_KEEP_MS = 85 * DAY;

/** Bu kadar süre sonuna kadar çekmemiş cihaz baştan indirir. */
export const STALE_DEVICE_MS = 60 * DAY;

const pulledName = (userId: string) => `pulled_at:${userId}`;

/** Bulut sonuna kadar indi — tazelik ölçüsü. */
export function markPulled(userId: string, at: number = Date.now()): void {
  writeState(pulledName(userId), String(at));
}

/**
 * Cihaz, bulutun silme işaretlerini kalıcı silmeye başladığı süreden
 * uzun süredir çekmemiş mi? Hiç çekmemişse hayır: ilk iniş zaten her
 * şeyi baştan indiriyor.
 */
export function isStaleDevice(userId: string, now: number = Date.now()): boolean {
  const raw = readState(pulledName(userId));
  if (raw == null) return false;
  const at = Number(raw);
  return Number.isFinite(at) && now - at > STALE_DEVICE_MS;
}

const NOT_QUEUED = (table: string) => sql`NOT EXISTS (
  SELECT 1 FROM outbox o WHERE o.table_name = ${table} AND o.row_id = ${sql.identifier(table)}.id
)`;

/**
 * Canlı bir kaydın hâlâ işaret ettiği silinmiş kayıt SİLİNMEZ — bulutun
 * kuralıyla aynı liste. Uygulama kazanç kaynağını silerken seferlerini
 * bırakıyor ve sefer kaynağın adını gösteriyor; kaynak silinseydi sefer
 * var olmayan bir kaynağa bağlı kalırdı.
 */
const REFERENCES: Partial<Record<SyncTable, readonly (readonly [SyncTable, string])[]>> = {
  vehicles: [
    ['shifts', 'vehicle_id'], ['rides', 'vehicle_id'], ['expenses', 'vehicle_id'],
    ['recurring_expenses', 'vehicle_id'], ['fuel_logs', 'vehicle_id'],
    ['vehicle_fuel_types', 'vehicle_id'], ['app_settings', 'default_vehicle_id'],
  ],
  earning_sources: [['rides', 'earning_source_id'], ['app_settings', 'default_earning_source_id']],
  expense_categories: [['expenses', 'category_id'], ['recurring_expenses', 'category_id']],
  shifts: [['rides', 'shift_id'], ['expenses', 'shift_id'], ['fuel_logs', 'shift_id']],
};

function notReferenced(table: SyncTable) {
  const refs = REFERENCES[table] ?? [];
  return sql.join(refs.map(([child, column]) => sql`AND NOT EXISTS (
    SELECT 1 FROM ${sql.identifier(child)} c
    WHERE c.user_id = ${sql.identifier(table)}.user_id
      AND c.${sql.identifier(column)} = ${sql.identifier(table)}.id AND c.deleted_at IS NULL
  )`), sql` `);
}

/**
 * Buluta gitmiş, `TOMBSTONE_KEEP_MS`'ten eski silme işaretlerini cihazdan
 * siler. Silinen satır sayısını döner.
 */
export function purgeLocalTombstones(userId: string, now: number = Date.now()): number {
  const before = now - TOMBSTONE_KEEP_MS;
  let removed = 0;
  getDb().transaction((tx) => {
    for (const table of SYNC_TABLES) {
      const result = tx.run(sql`DELETE FROM ${sql.identifier(table)}
        WHERE user_id = ${userId} AND deleted_at IS NOT NULL AND deleted_at < ${before}
          AND ${NOT_QUEUED(table)} ${notReferenced(table)}`);
      removed += Number(result.changes ?? 0);
    }
  });
  return removed;
}

/**
 * Bayat cihazı baştan indirmeye hazırlar: kuyrukta olmayan satırlar ve
 * imleçler silinir, açılış kapısı yeniden "kayıtların yükleniyor" der —
 * yarım veriyle hesaplanmış rakam gösterilmesin (bkz. `lib/setup-gate.ts`).
 */
export function resetForFullPull(userId: string): void {
  getDb().transaction((tx) => {
    for (const table of SYNC_TABLES) {
      tx.run(sql`DELETE FROM ${sql.identifier(table)}
        WHERE user_id = ${userId} AND ${NOT_QUEUED(table)}`);
    }
    for (const key of [`downloaded:${userId}`, `last_success_at:${userId}`, pulledName(userId)]) {
      tx.run(sql`DELETE FROM sync_state WHERE key = ${key}`);
    }
  });
  resetPullCursor(userId);
}
