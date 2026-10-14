/**
 * Senkronlanan tabloların listesi ve tip dönüşümü gereken sütunlar.
 *
 * Sütun ADLARI iki tarafta birebir aynı — bu yüzden satırlar hiçbir
 * eşleme yapılmadan `SELECT *` çıktısı olarak gönderiliyor. Bu eşitliği
 * `schema-parity.test.ts` her koşuda doğruluyor; sapan sütun senkronu
 * sessizce durdurur.
 */

/**
 * Gönderim sırası.
 *
 * Bulutta kullanıcı tabloları arasında yabancı anahtar YOK — yalnızca
 * `auth.users`'a bağlılar. Bu bilinçliydi: çevrimdışı üretilen bir sefer,
 * ait olduğu vardiyadan önce buluta ulaşabilmeli. Yine de sıra mantıklı
 * tutuldu; bir gün kısıt eklenirse çalışmaya devam etsin.
 */
export const SYNC_TABLES = [
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

export type SyncTable = (typeof SYNC_TABLES)[number];

const SYNC_TABLE_SET: ReadonlySet<string> = new Set(SYNC_TABLES);

export function isSyncTable(name: string): name is SyncTable {
  return SYNC_TABLE_SET.has(name);
}

/**
 * SQLite'ta 0/1 tam sayı, Postgres'te `boolean` olan sütunlar.
 *
 * Çevrilmezse PostgREST "invalid input syntax for type boolean" der ve
 * o tablonun tamamı senkronlanamaz. Ters yönde de gerekli: buluttan
 * `true` gelir, SQLite'a 1 yazılmalı.
 */
export const BOOLEAN_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  vehicles: ['is_active', 'has_accident_record'],
  vehicle_fuel_types: ['is_consumption_measured', 'is_primary'],
  earning_sources: ['is_active'],
  expense_categories: ['is_system', 'is_active'],
  recurring_expenses: ['is_active'],
  fuel_logs: ['is_full_tank'],
  goals: ['is_active'],
};

/** Ham SQLite satırını buluta gönderilebilir hâle getirir. */
export function toCloudRow(
  table: string, row: Record<string, unknown>,
): Record<string, unknown> {
  const bools = BOOLEAN_COLUMNS[table];
  if (!bools) return row;

  const out = { ...row };
  for (const col of bools) {
    if (col in out && out[col] != null) out[col] = Boolean(out[col]);
  }
  return out;
}

/**
 * Buluttan gelen satırı SQLite'a yazılabilir hâle getirir.
 *
 * `server_updated_at` ATILIR: yerelde böyle bir sütun yok ve olmamalı da —
 * o sunucunun imleci, cihazın uyduracağı bir değer değil.
 *
 * `columns` verilirse YERELDE OLMAYAN her sütun da atılır. Buluta sütun
 * önce eklenir, uygulama sonra güncellenir; aradaki sürede eski
 * istemciler o sütunu tanımıyor. Atılmasaydı SQLite "no such column"
 * der, o tablonun çekmesi dururdu — ve eski ortak imleçle bütün
 * tablolarınki. Sütunun değeri kaybolmaz, bulutta duruyor. Sütunu
 * yerele ekleyen sürüm imleçleri sıfırlamalı (`resetPullCursor`): yoksa
 * önceden inmiş satırlarda yeni sütun boş kalır ve o satır bir sonraki
 * düzenlemede buluttaki değeri boşla ezer.
 */
export function toLocalRow(
  table: string,
  row: Record<string, unknown>,
  columns?: ReadonlySet<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const bools = new Set(BOOLEAN_COLUMNS[table] ?? []);

  for (const [key, value] of Object.entries(row)) {
    if (key === 'server_updated_at') continue;
    if (columns && !columns.has(key)) continue;
    out[key] = bools.has(key) && value != null ? (value ? 1 : 0) : value;
  }
  return out;
}
