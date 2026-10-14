/**
 * Tek seferlik kurtarma — eski senkronun buluta göndermeden düşürdüğü
 * düzeltmeler.
 *
 * Eski gönderim, istek yoldayken yapılan düzeltmenin kuyruk kaydını eski
 * isteğin onayıyla siliyordu. Sonuç KALICI bir ayrışmaydı: cihaz yeni
 * hâlde, bulut eski hâlde, kuyruk boş; çekme de "cihazdaki daha yeni"
 * diyerek buluttakini atlıyordu. Sürücü telefon değiştirdiğinde o
 * düzeltmeler yok olacaktı.
 *
 * Yeni imleçler hesap başına boş başladığı için her hesabın ilk turu
 * buluttaki her şeyi baştan tarıyor. Kurtarma bu taramaya eklenir:
 *
 * 1. Cihazdaki hâl buluttakinden YENİYSE ve kuyrukta değilse kayıt
 *    yeniden kuyruğa alınır.
 * 2. Bir tablo sonuna kadar inince, cihazda olup bulutta HİÇ görülmeyen
 *    ve kuyrukta beklemeyen kayıtlar kuyruğa alınır.
 *
 * `updated_at`'e DOKUNULMAZ. Sunucu tetikleyicisi bayat yazmayı
 * reddediyor: kayıt kendi damgasıyla gider, bulutta daha yenisi varsa
 * sessizce atlanır, yeni olan çekmeyle gelip cihazdakini ezer. Damgayı
 * "şimdi" yapmak, başka cihazdaki daha yeni bir düzeltmeyi ezerdi.
 *
 * Tarama birkaç tura yayılabilir ve uygulama arada kapanabilir; görülen
 * kimlikler bu yüzden tabloda (`sync_recovery_seen`) tutuluyor ve imleçle
 * aynı işlemde yazılıyor. Tekrar çalışması zararsız: kuyruğa alma
 * idempotent, bayrak da işin bittiğini kalıcı olarak işaretliyor.
 */

import { and, eq, like } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { enqueue } from '@/db/repo/_base';
import { syncRecoverySeen, syncState } from '@/db/schema';
import { readState, writeState } from './state';
import { SYNC_TABLES, type SyncTable } from './tables';

const DONE = 'done';
const accountFlag = (userId: string) => `recovery_v2:${userId}`;
const tableFlag = (userId: string, table: string) => `recovery_v2:${userId}:${table}`;

export function isRecoveryDone(userId: string): boolean {
  return readState(accountFlag(userId)) === DONE;
}

export function isTableRecovered(userId: string, table: string): boolean {
  return isRecoveryDone(userId) || readState(tableFlag(userId, table)) === DONE;
}

/** Buluttan inen kimliği deftere yazar. */
export function noteSeen(userId: string, table: string, rowId: string): void {
  getDb().insert(syncRecoverySeen)
    .values({ userId, tableName: table, rowId })
    .onConflictDoNothing()
    .run();
}

export function isQueued(table: string, rowId: string): boolean {
  return getDb().$client.getFirstSync<{ one: number }>(
    'SELECT 1 AS one FROM outbox WHERE table_name = ? AND row_id = ?', [table, rowId],
  ) !== null;
}

/**
 * Cihazdaki hâl buluttakinden yeni ama kuyrukta değil: yeniden kuyruğa.
 * Çağıran işlemin içinde çalışır.
 */
export function requeueNewerLocal(
  table: SyncTable, rowId: string, deletedAt: unknown, now: number,
): boolean {
  if (isQueued(table, rowId)) return false;
  enqueue(getDb(), table, rowId, deletedAt != null ? 'delete' : 'upsert', now);
  return true;
}

/**
 * Tablo sonuna kadar indi: bulutta hiç görülmeyen yerel kayıtlar kuyruğa.
 * Döndürdüğü sayı kuyruğa alınan kayıt.
 */
export function finishTableRecovery(
  userId: string, table: SyncTable, now: number = Date.now(),
): number {
  const db = getDb();
  let requeued = 0;

  db.transaction(() => {
    const missing = db.$client.getAllSync<{ id: string; deleted_at: number | null }>(
      `SELECT t.id AS id, t.deleted_at AS deleted_at FROM "${table}" t
       WHERE t.user_id = ?
         AND NOT EXISTS (SELECT 1 FROM sync_recovery_seen s
           WHERE s.user_id = ? AND s.table_name = ? AND s.row_id = t.id)
         AND NOT EXISTS (SELECT 1 FROM outbox o
           WHERE o.table_name = ? AND o.row_id = t.id)`,
      [userId, userId, table, table],
    );
    for (const row of missing) {
      enqueue(db, table, row.id, row.deleted_at != null ? 'delete' : 'upsert', now);
      requeued += 1;
    }

    db.delete(syncRecoverySeen).where(and(
      eq(syncRecoverySeen.userId, userId), eq(syncRecoverySeen.tableName, table),
    )).run();
    writeState(tableFlag(userId, table), DONE);
  });

  return requeued;
}

/** Bütün tablolar bittiyse hesabı işaretler ve ara bayrakları temizler. */
export function finishRecovery(userId: string): boolean {
  if (isRecoveryDone(userId)) return true;
  if (!SYNC_TABLES.every((t) => readState(tableFlag(userId, t)) === DONE)) return false;

  getDb().transaction(() => {
    writeState(accountFlag(userId), DONE);
    getDb().delete(syncState).where(like(syncState.key, `${accountFlag(userId)}:%`)).run();
  });
  return true;
}
