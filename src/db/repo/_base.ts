/**
 * Yazma katmanının ortak parçaları.
 *
 * BURADAKİ TEK KURAL: senkronlanan bir tabloya yapılan her yazma, AYNI
 * İŞLEM İÇİNDE `outbox`'a da düşer. Yazma başarılı olup kuyruğa girmezse
 * kayıt buluta hiç gitmez ve bunu kimse fark etmez — bu yüzden ikisi
 * ayrılamaz, `withOutbox` dışında ham insert/update yazılmaz.
 *
 * İKİNCİ KURAL: var olan tek bir kayda dokunan her yol — okuma dahil —
 * sahibini de koşula koyar (`ownedById`). Güncelleme ve silme bu yüzden
 * `updateOwned` / `softDeleteRow` üzerinden gider.
 *
 * Fonksiyonlar SENKRONDUR. `expo-sqlite` sürücüsü senkron çalışıyor ve
 * arayüzün ağ değil, veritabanı bile beklememesi gerekiyor: sürücü
 * tutarı yazar, ekran o an güncellenir.
 */

import { and, eq, isNull, sql } from 'drizzle-orm';
import type { SQLiteTable, SQLiteUpdateSetSource } from 'drizzle-orm/sqlite-core';
import { getDb } from '../client';
import { newId } from '@/lib/id';

/** Milisaniye cinsinden unix damgası. */
export type UnixMs = number;

export type OutboxOperation = 'upsert' | 'delete';

/** İşlem içindeki veritabanı tutamacı. */
export type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

/**
 * Buluta senkronlanan tablolar.
 *
 * `outbox` ve `sync_state` yereldir. `fuel_prices` TEK YÖNLÜDÜR —
 * sunucudan iner, cihazdan çıkmaz; kullanıcıya ait veri değil, ortak
 * referans veridir.
 */
export const SYNCED_TABLES = [
  'vehicles', 'vehicle_fuel_types', 'earning_sources', 'shifts', 'rides',
  'expense_categories', 'expenses', 'recurring_expenses', 'fuel_logs',
  'app_settings', 'goals',
] as const;

export type SyncedTableName = (typeof SYNCED_TABLES)[number];

/** Senkron sütunlarının yeni kayıt için doldurulmuş hâli. */
export interface NewRowStamp {
  id: string;
  userId: string;
  createdAt: UnixMs;
  updatedAt: UnixMs;
  deletedAt: null;
}

/**
 * Yeni kaydın kimlik ve zaman damgaları.
 *
 * Kimlik CİHAZDA üretilir — kayıt çevrimdışıyken de kalıcı kimliğine
 * sahip olur ve ilişkiler ağ beklemeden kurulabilir.
 */
export function stampNew(userId: string, now: UnixMs = Date.now()): NewRowStamp {
  return { id: newId(), userId, createdAt: now, updatedAt: now, deletedAt: null };
}

/**
 * Yazma işlemini ve kuyruğa eklemeyi TEK İŞLEMDE çalıştırır.
 *
 * `write`'ın döndürdüğü değer aynen geri döner — böylece çağıran,
 * ürettiği kaydı beklemeden kullanabilir.
 */
export function withOutbox<T>(
  tableName: SyncedTableName,
  rowId: string,
  operation: OutboxOperation,
  write: (tx: Tx) => T,
  now: UnixMs = Date.now(),
): T {
  return getDb().transaction((tx) => {
    const result = write(tx);
    enqueue(tx, tableName, rowId, operation, now);
    return result;
  });
}

/**
 * Kuyruğa ekler.
 *
 * Satırın kendisi değil YALNIZCA KİMLİĞİ tutulur: sürücü aynı seferi beş
 * kez düzeltirse kuyrukta yine tek satır olur ve gönderim anında kaydın
 * son hâli okunur.
 *
 * Çakışmada `operation` GÜNCELLENİR — silme, bekleyen bir güncellemeyi
 * ezmeli; yoksa silinen kayıt buluta güncelleme olarak gider ve dirilir.
 * Deneme sayacı da sıfırlanır: kayıt değişti, eski hata artık geçersiz.
 * `revision` BİR ARTAR: gönderim o sırada eski hâli taşıyan bir isteği
 * bekliyorsa, onayı bu kaydı silemesin (bkz. `outbox.revision`).
 *
 * Sahip (`user_id`) satırın kendisinden, AYNI İŞLEMDE okunur. Satır yoksa
 * — var olmayan bir kimlik güncellendi ya da silindi — kuyruğa HİÇBİR
 * ŞEY yazılmaz: gönderilecek bir şey yok. Eskiden böyle bir girdi
 * kuyruğa düşüyor, gönderim de yerelde satır bulamayınca kaydı buluttan
 * sert siliyordu.
 */
export function enqueue(
  tx: Pick<Tx, 'run'>,
  tableName: SyncedTableName,
  rowId: string,
  operation: OutboxOperation,
  now: UnixMs = Date.now(),
): void {
  tx.run(sql`
    INSERT INTO outbox
      (table_name, row_id, user_id, operation, revision, attempt_count, created_at)
    SELECT ${tableName}, id, user_id, ${operation}, 1, 0, ${now}
    FROM ${sql.identifier(tableName)} WHERE id = ${rowId}
    ON CONFLICT (table_name, row_id) DO UPDATE SET
      operation = excluded.operation,
      user_id = excluded.user_id,
      revision = outbox.revision + 1,
      attempt_count = 0,
      last_error = NULL,
      next_attempt_at = NULL
  `);
}

/**
 * Silinmemiş kayıt koşulu — her okuma sorgusu bunu taşımak zorunda.
 *
 * Yumuşak silinen satırlar tabloda durmaya devam ediyor; koşulu unutan
 * sorgu silinmiş kaydı geri getirir.
 */
export function alive<T extends { userId: any; deletedAt: any }>(
  table: T, userId: string,
) {
  return and(eq(table.userId, userId), isNull(table.deletedAt));
}

/**
 * Tek kaydın koşulu: kimlik, SAHİP ve silinmemiş — üçü birden.
 *
 * Kimlik tek başına YETMEZ. Aynı cihazda birden fazla hesap açılabiliyor
 * ve çıkışta yerel veri hesap başına saklanıyor; yalnızca kimlikle
 * okuyan ya da yazan bir fonksiyon, B oturumunda A'nın kaydını gösterir,
 * düzeltir ve kuyruğa koyar — A girince de buluta götürür. Ekranlar
 * kimliği URL'den aldığı için süzgeç arayüzde değil, burada durmak
 * zorunda.
 */
export function ownedById<T extends { id: any; userId: any; deletedAt: any }>(
  table: T, userId: string, id: string,
) {
  return and(eq(table.id, id), eq(table.userId, userId), isNull(table.deletedAt));
}

/**
 * İlişkilendirilmek istenen kayıt bu hesaba ait değil ya da silinmiş.
 *
 * Sessizce düzeltilmiyor, AÇIKÇA reddediliyor: yabancı vardiyaya bağlanan
 * sefer o vardiyanın gününü alır, yabancı araçla açılan vardiya o aracın
 * yıpranma oranıyla hesaplanır. İkisi de sürücünün göremeyeceği yanlış
 * sayılar üretir.
 */
export class ForeignRecordError extends Error {
  readonly tableName: SyncedTableName;
  readonly rowId: string;

  constructor(tableName: SyncedTableName, rowId: string) {
    super(`Kayıt bulunamadı ya da bu hesaba ait değil (${tableName}: ${rowId}).`);
    this.name = 'ForeignRecordError';
    this.tableName = tableName;
    this.rowId = rowId;
  }
}

/** Kayıt bu hesabın ve silinmemiş mi? Değilse `ForeignRecordError`. */
export function assertOwned<T extends SQLiteTable & { id: any; userId: any; deletedAt: any }>(
  table: T, tableName: SyncedTableName, userId: string, id: string,
): void {
  const row = getDb().select({ id: table.id }).from(table as any)
    .where(ownedById(table, userId, id)).get();
  if (!row) throw new ForeignRecordError(tableName, id);
}

/** Boş değilse sahipliğini denetler — isteğe bağlı ilişkiler için. */
export function assertOwnedIfSet<T extends SQLiteTable & { id: any; userId: any; deletedAt: any }>(
  table: T, tableName: SyncedTableName, userId: string, id: string | null | undefined,
): void {
  if (id != null) assertOwned(table, tableName, userId, id);
}

/**
 * Sahibine ait, silinmemiş TEK bir satırı günceller ve kuyruğa yazar.
 *
 * Satır değişmediyse — yabancı, silinmiş ya da hiç var olmayan kimlik —
 * `false` döner ve kuyruğa HİÇBİR ŞEY yazılmaz. Kuyruğa yazmak ancak
 * gerçekten bir satır değiştiyse anlamlı: gönderilecek başka bir şey yok.
 *
 * `updatedAt` burada damgalanıyor; çağıranın unutması mümkün olmasın.
 */
export function updateOwned<T extends SQLiteTable & { id: any; userId: any; deletedAt: any }>(
  table: T,
  tableName: SyncedTableName,
  userId: string,
  id: string,
  set: SQLiteUpdateSetSource<T>,
  now: UnixMs = Date.now(),
): boolean {
  return writeOwnedRow(table, tableName, userId, id, set, 'upsert', now);
}

/**
 * Yumuşak silme — `deleted_at` damgalanır, satır tabloda durur.
 *
 * SERT SİLME YAPILMAZ. Cihaz A satırı gerçekten silerse, cihaz B kaydın
 * eski hâlini geri gönderir ve silinen kayıt dirilir.
 *
 * Yalnızca bu hesabın silinmemiş satırı silinir; aksi hâlde `false`
 * döner ve kuyruk değişmez.
 */
export function softDeleteRow<T extends SQLiteTable & { id: any; userId: any; deletedAt: any }>(
  table: T,
  tableName: SyncedTableName,
  userId: string,
  id: string,
  now: UnixMs = Date.now(),
): boolean {
  return writeOwnedRow(
    table, tableName, userId, id, { deletedAt: now } as SQLiteUpdateSetSource<T>, 'delete', now,
  );
}

/**
 * Güncelleme ve silmenin ortak gövdesi.
 *
 * Tablo tipi burada genelleştirilemiyor: Drizzle'ın `update().set()`
 * imzası tabloya özgü. Tek yerde, açıkça daraltıyoruz — çağıranların
 * tamamı `schema` içindeki gerçek tablo nesnelerini veriyor ve `set`'in
 * tipi dışarıda tabloya göre denetleniyor.
 */
function writeOwnedRow<T extends SQLiteTable & { id: any; userId: any; deletedAt: any }>(
  table: T,
  tableName: SyncedTableName,
  userId: string,
  id: string,
  set: SQLiteUpdateSetSource<T>,
  operation: OutboxOperation,
  now: UnixMs,
): boolean {
  return getDb().transaction((tx) => {
    const { changes } = (tx.update(table as any) as any)
      .set({ ...set, updatedAt: now })
      .where(ownedById(table, userId, id))
      .run() as { changes: number };
    if (changes === 0) return false;
    enqueue(tx, tableName, id, operation, now);
    return true;
  });
}
