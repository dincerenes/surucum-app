/**
 * Gönderim — `outbox` kuyruğunu buluta boşaltır.
 *
 * Kuyrukta satırın kendisi değil KİMLİĞİ duruyor; gönderim anında kaydın
 * son hâli okunuyor. Sürücü aynı seferi beş kez düzelttiyse buluta tek
 * gönderim gider ve giden şey son hâlidir.
 *
 * YALNIZCA OTURUMDAKİ HESABIN kuyruğu seçilir. Aynı cihazda başka bir
 * hesabın bekleyen kayıtları kuyrukta kalır ve o hesap döndüğünde gider;
 * seçime girselerdi her turda sıranın başını tutup bu hesabın kayıtlarını
 * hiç göndertmezlerdi.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  and, asc, count, eq, gt, gte, inArray, isNull, lt, lte, or,
} from 'drizzle-orm';
import { getDb } from '@/db/client';
import { outbox } from '@/db/schema';
import { NO_GUARD, type SyncGuard, isSessionChanged } from './guard';
import { SYNC_TABLES, isSyncTable, toCloudRow } from './tables';

/** Tek istekte gönderilecek en fazla kuyruk kaydı. */
const BATCH_SIZE = 400;

/**
 * Bir turda en fazla kaç parti. Uzun çevrimdışı kalmış bir cihazın
 * binlerce kaydı 90 saniyelik aralıklara takılmasın; ama tek bir tur da
 * sonsuza kadar sürmesin. Kalan varsa zamanlayıcı hemen yeni tur açar.
 */
const MAX_BATCHES = 5;

/** Geri çekilme tavanı — bir saatten uzun beklenmez. */
const MAX_BACKOFF_MS = 60 * 60 * 1000;
const BASE_BACKOFF_MS = 5_000;

/**
 * Bu kadar denemeden sonra kayıt "takılı" sayılır.
 *
 * Eşiği aşan kayıt büyük ihtimalle geçici bir ağ sorunundan değil,
 * sunucunun kalıcı olarak reddettiği bir veriden dolayı bekliyor. Öne
 * gelişte beklemesi iptal edilmez ve arayüzde ayrıca sayılır.
 */
export const STUCK_ATTEMPT_THRESHOLD = 5;

export interface PushResult {
  sent: number;
  /** Gönderilemeyen — geri çekilmeyle yeniden denenecek. */
  failed: number;
  /** Yerelde satırı olmadığı için yalnızca kuyruktan düşürülen girdi. */
  dropped: number;
  errors: string[];
}

export interface PushOptions {
  now?: number;
  guard?: SyncGuard;
}

/** Kuyruk girdisinin gönderim anındaki hâli. */
interface QueueSnapshot {
  id: number;
  tableName: string;
  rowId: string;
  revision: number;
  attemptCount: number;
}

export async function pushOutbox(
  supabase: SupabaseClient, userId: string, options: PushOptions = {},
): Promise<PushResult> {
  const now = options.now ?? Date.now();
  const guard = options.guard ?? NO_GUARD;
  const result: PushResult = { sent: 0, failed: 0, dropped: 0, errors: [] };

  guard();
  result.dropped += adoptLegacyEntries();

  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    guard();
    const ready = selectReady(userId, now);
    if (ready.length === 0) break;

    await pushBatch(supabase, userId, ready, now, guard, result);
    // Hata varsa bu turda üstelemeyiz — geri çekilme zaten işliyor.
    if (result.errors.length > 0) break;
  }

  return result;
}

function selectReady(userId: string, now: number): QueueSnapshot[] {
  return getDb().select({
    id: outbox.id,
    tableName: outbox.tableName,
    rowId: outbox.rowId,
    revision: outbox.revision,
    attemptCount: outbox.attemptCount,
  }).from(outbox)
    .where(and(
      eq(outbox.userId, userId),
      or(isNull(outbox.nextAttemptAt), lte(outbox.nextAttemptAt, now)),
    ))
    .orderBy(asc(outbox.id))
    .limit(BATCH_SIZE)
    .all();
}

async function pushBatch(
  supabase: SupabaseClient,
  userId: string,
  ready: readonly QueueSnapshot[],
  now: number,
  guard: SyncGuard,
  result: PushResult,
): Promise<void> {
  const byTable = new Map<string, number[]>();
  const unknown: QueueSnapshot[] = [];
  for (const entry of ready) {
    if (!isSyncTable(entry.tableName)) {
      unknown.push(entry);
      continue;
    }
    const ids = byTable.get(entry.tableName) ?? [];
    ids.push(entry.id);
    byTable.set(entry.tableName, ids);
  }
  // Tanınmayan tablo: kuyrukta kalmasının anlamı yok, hiç gitmeyecek.
  if (unknown.length > 0) result.dropped += acknowledge(unknown);

  // Gönderim sırası SYNC_TABLES'a göre.
  for (const table of SYNC_TABLES) {
    const queueIds = byTable.get(table);
    if (!queueIds) continue;
    guard();

    /**
     * Kuyruk revizyonları ve satırlar AYNI senkron blokta, bu sırayla
     * okunuyor — arada bekleme yok. Böylece gönderilen satır her zaman
     * anlık görüntüdeki revizyon kadar ya da ondan yeni: istek sürerken
     * gelen düzeltme revizyonu artırır, onay onu silemez ve düzeltme
     * sonraki partide gider. En kötü sonuç fazladan bir gönderim.
     */
    const snapshot = readQueue(queueIds);
    const rows = readLocalRows(table, snapshot.map((e) => e.rowId));
    const byId = new Map(rows.map((r) => [String(r.id), r]));

    const orphans: QueueSnapshot[] = [];
    const sending: QueueSnapshot[] = [];
    const payload: Record<string, unknown>[] = [];

    for (const entry of snapshot) {
      const row = byId.get(entry.rowId);

      /**
       * Yerelde satır yok: GÖNDERİLECEK BİR ŞEY YOK, girdi yalnızca
       * kuyruktan düşer. Buluta DOKUNULMAZ.
       *
       * Eskiden bu durum buluttan SERT SİLME sayılıyordu. Ama kuyruğa
       * var olmayan bir kimlik de düşebiliyordu; aynı kimlik bulutta
       * henüz inmemiş bir kayda aitse o kayıt geri dönülmez biçimde
       * yok olurdu. Silme her zaman yumuşaktır (`deleted_at`).
       */
      if (!row) {
        orphans.push(entry);
        continue;
      }

      /**
       * Savunma: kuyruk sahibi satırın kendisinden yazıldığı için buraya
       * düşülmemeli. Düşülürse girdiye dokunulmaz — başka hesabın kaydı
       * silinmez, o hesap döndüğünde gider.
       */
      if (row.user_id !== userId) continue;

      /**
       * Yumuşak silinen satır da UPSERT ile gider — `deleted_at` damgalı
       * hâliyle. Sert silme senkronda kaydı diriltir: bu cihaz satırı
       * yok eder, diğer cihaz eski hâlini geri gönderir.
       */
      sending.push(entry);
      payload.push(toCloudRow(table, row));
    }

    if (orphans.length > 0) result.dropped += acknowledge(orphans);
    if (sending.length === 0) continue;

    try {
      const { error } = await supabase.from(table).upsert(payload, {
        onConflict: 'id', defaultToNull: false,
      });
      guard();
      if (error) throw new Error(error.message);
      acknowledge(sending);
      result.sent += sending.length;
    } catch (error) {
      if (isSessionChanged(error)) throw error;
      const message = describe(error);
      result.failed += sending.length;
      result.errors.push(`${table}: ${message}`);
      backoff(sending, message, now);
    }
  }
}

function readQueue(ids: number[]): QueueSnapshot[] {
  return getDb().select({
    id: outbox.id,
    tableName: outbox.tableName,
    rowId: outbox.rowId,
    revision: outbox.revision,
    attemptCount: outbox.attemptCount,
  }).from(outbox)
    .where(inArray(outbox.id, ids))
    .orderBy(asc(outbox.id))
    .all();
}

/**
 * Yerel satırları HAM okur — `SELECT *`.
 *
 * Drizzle üzerinden okunsaydı anahtarlar camelCase gelirdi ve buluta
 * göndermek için geri çevirmek gerekirdi. Ham okumada anahtarlar zaten
 * SQLite sütun adları, yani buluttakiyle birebir aynı.
 */
function readLocalRows(table: string, ids: string[]): Record<string, any>[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  return getDb().$client.getAllSync<Record<string, any>>(
    `SELECT * FROM "${table}" WHERE id IN (${placeholders})`, ids,
  );
}

/**
 * Gönderilen girdileri kuyruktan siler — YALNIZCA revizyon aynıysa.
 *
 * Revizyon değiştiyse istek sürerken kayıt yeniden düzenlendi demektir:
 * giden hâl eskidi, yenisi henüz gitmedi. Girdi kuyrukta kalır.
 */
function acknowledge(entries: readonly QueueSnapshot[]): number {
  let removed = 0;
  getDb().transaction((tx) => {
    for (const entry of entries) {
      removed += tx.delete(outbox)
        .where(and(eq(outbox.id, entry.id), eq(outbox.revision, entry.revision)))
        .run().changes;
    }
  });
  return removed;
}

/**
 * Başarısız kayıtları üstel geri çekilmeyle erteler.
 *
 * Ertelenmezse kuyruk her turda aynı hatayı tekrarlar ve ağ kapalıyken
 * pil tüketir. Tavan bir saat: sürücü tünelden çıkınca uzun süre
 * beklemesin.
 *
 * Bekleme süresi HER KAYDIN KENDİ deneme sayısından hesaplanıyor. Toplu
 * tek bir güncelleme yazmak, kuyruğa yeni girmiş bir kaydı yıllardır
 * başarısız olan bir kaydın gecikmesiyle cezalandırırdı.
 *
 * Onay gibi bu da revizyona bağlı: istek sürerken yapılan düzeltme
 * sayacı sıfırladı ve kaydı hemen gönderilecek hâle getirdi. Başarısız
 * olan ESKİ hâlin cezası onu ezmemeli.
 */
function backoff(entries: readonly QueueSnapshot[], message: string, now: number): void {
  const detail = message.slice(0, 500);
  getDb().transaction((tx) => {
    for (const entry of entries) {
      const delay = Math.min(
        MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.min(entry.attemptCount, 20),
      );
      tx.update(outbox).set({
        attemptCount: entry.attemptCount + 1,
        lastError: detail,
        lastAttemptAt: now,
        nextAttemptAt: now + delay,
      }).where(and(eq(outbox.id, entry.id), eq(outbox.revision, entry.revision))).run();
    }
  });
}

/**
 * Sahibi yazılmamış eski kuyruk girdilerini çözer.
 *
 * 0008 migration'ı bunları zaten doldurdu; burada kalan, yerel satırı
 * olmayan girdilerdir. Sahip satırdan okunabiliyorsa yazılır, satır
 * yoksa girdi kuyruktan düşer — gönderilecek bir şey yok.
 */
function adoptLegacyEntries(): number {
  const db = getDb();
  const legacy = db.select({
    id: outbox.id, tableName: outbox.tableName, rowId: outbox.rowId,
  }).from(outbox).where(isNull(outbox.userId)).all();
  if (legacy.length === 0) return 0;

  let dropped = 0;
  db.transaction((tx) => {
    for (const entry of legacy) {
      const owner = isSyncTable(entry.tableName)
        ? db.$client.getFirstSync<{ user_id: string }>(
          `SELECT user_id FROM "${entry.tableName}" WHERE id = ?`, [entry.rowId],
        )
        : null;
      const target = and(eq(outbox.id, entry.id), isNull(outbox.userId));
      if (owner) {
        tx.update(outbox).set({ userId: owner.user_id }).where(target).run();
      } else {
        dropped += tx.delete(outbox).where(target).run().changes;
      }
    }
  });
  return dropped;
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function countWhere(condition: ReturnType<typeof and>): number {
  return getDb().select({ n: count() }).from(outbox).where(condition).get()?.n ?? 0;
}

/** Bu hesabın kuyrukta bekleyen kayıt sayısı. */
export function pendingCount(userId: string): number {
  return countWhere(eq(outbox.userId, userId));
}

/** Bu hesabın deneme eşiğini aşmış, büyük ihtimalle kalıcı reddedilen kayıtları. */
export function stuckCount(userId: string): number {
  return countWhere(and(
    eq(outbox.userId, userId), gte(outbox.attemptCount, STUCK_ATTEMPT_THRESHOLD),
  ));
}

/** Şu an gönderilmeye hazır, beklemede olmayan kayıtlar. */
export function readyCount(userId: string, now: number = Date.now()): number {
  return countWhere(and(
    eq(outbox.userId, userId),
    or(isNull(outbox.nextAttemptAt), lte(outbox.nextAttemptAt, now)),
  ));
}

/**
 * Geçici hatalardan doğan beklemeleri iptal eder.
 *
 * Geri çekilme tavanı bir saat: sürücü tünelden ya da kapsama dışından
 * çıktığında kuyruk kendiliğinden bu kadar bekleyebilir. Uygulamayı öne
 * getirmek ya da elle senkron istemek, bağlantının döndüğüne dair en güçlü
 * işaret — o anda beklemeyi sürdürmek anlamsız.
 *
 * ISRARLA BAŞARISIZ OLAN KAYITLAR muaf tutuluyor (bkz.
 * `STUCK_ATTEMPT_THRESHOLD`): onları her açılışta yeniden denemek pil ve
 * istek harcamaktan başka işe yaramaz.
 */
export function clearTransientBackoff(userId: string): number {
  return getDb().update(outbox)
    .set({ nextAttemptAt: null })
    .where(and(
      eq(outbox.userId, userId),
      gt(outbox.attemptCount, 0),
      lt(outbox.attemptCount, STUCK_ATTEMPT_THRESHOLD),
    ))
    .run().changes;
}
