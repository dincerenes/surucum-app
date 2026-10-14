/**
 * Çekme — buluttan değişen kayıtları indirir.
 *
 * ARTIMLIDIR: her tablo, kendi imlecinden SONRAKİ satırları ister. İmleç
 * sunucudan gelen damga + kimlik çiftidir, cihaz saati değil — cihaz
 * saati ileri alınmış olsaydı aradaki tüm kayıtlar hiç indirilmezdi.
 * İmlecin neden çift olduğu `cursor.ts`'te.
 *
 * İmleç TABLO VE HESAP BAŞINA tutuluyor. Tek ortak imleç üç ayrı yoldan
 * kayıt kaybettiriyordu: bir tablonun hatası hepsini durduruyordu, tur
 * ortasında daha önce okunmuş bir tabloya yazılan kayıt atlanıyordu ve
 * aynı cihazdaki ikinci hesap birincinin imlecinden devam ediyordu.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getDb } from '@/db/client';
import { type PullKey, compareKeys, keyFilter, lookbackKey, maxKey, tsMicros } from './cursor';
import { NO_GUARD, type SyncGuard, isSessionChanged } from './guard';
import {
  finishRecovery, finishTableRecovery, isTableRecovered, noteSeen, requeueNewerLocal,
} from './recovery';
import { reportPullProgress } from './progress';
import { getPullProgress, setPullProgress } from './state';
import { SYNC_TABLES, type SyncTable, toLocalRow } from './tables';

/** Tek istekte indirilecek en fazla satır. */
const PAGE_SIZE = 500;

/**
 * Bir turda tablo başına en fazla sayfa. Yeni telefonda 10.000 kayıtlık
 * bir tablo tek turda iner; daha büyüğü sonraki turlara kalır ve sonuç
 * `complete: false` döner — zamanlayıcı hemen yeni tur açar.
 */
const MAX_PAGES_PER_TABLE = 20;

/**
 * Geriye bakış penceresi — her tur imlecin bu kadar gerisinden okumaya
 * başlar. Sunucu damgası işlem BAŞINDA alınıyor, satır ise commit edilince
 * görünüyor; geç commit edilen bir işlemin satırı, damgası imlecin
 * gerisinde kaldığı için bir daha istenmezdi. Pencere bir isteğin
 * sunucudaki süre sınırından çok daha geniş.
 */
const LOOKBACK_MS = 2 * 60 * 1000;

export interface PullResult {
  /** Yerele yazılan satır. */
  applied: number;
  /** Yerelde daha yeni sürüm olduğu için atlanan satır. */
  skippedStale: number;
  /** İçeriği yereldekiyle birebir aynı olduğu için yazılmayan satır. */
  unchanged: number;
  /** Kurtarma taramasında yeniden kuyruğa alınan yerel kayıt. */
  requeued: number;
  /**
   * Bütün tablolar sonuna kadar indi mi? Hata varsa ya da bir tablo
   * sayfa sınırına takıldıysa `false`. Geri yükleme ekranı buna bakar.
   */
  complete: boolean;
  errors: string[];
}

export interface PullOptions {
  guard?: SyncGuard;
  now?: number;
  /** Sayfa boyu; varsayılan `PAGE_SIZE`. */
  pageSize?: number;
  /** Tablo başına bu çağrıdaki sayfa sınırı; varsayılan `MAX_PAGES_PER_TABLE`. */
  maxPagesPerTable?: number;
}

export async function pullChanges(
  supabase: SupabaseClient, userId: string, options: PullOptions = {},
): Promise<PullResult> {
  const guard = options.guard ?? NO_GUARD;
  const now = options.now ?? Date.now();
  const limits: PageLimits = {
    pageSize: options.pageSize ?? PAGE_SIZE,
    maxPages: options.maxPagesPerTable ?? MAX_PAGES_PER_TABLE,
  };
  const result: PullResult = {
    applied: 0, skippedStale: 0, unchanged: 0, requeued: 0,
    complete: false, errors: [],
  };

  /**
   * Tablolar AYNI ANDA iniyor. Sırayla inince her tablo bir ağ gidiş-
   * dönüşü bekliyordu; yeni telefonda 11 tablo × ~0,5 sn, kayıt az olsa
   * bile 7 saniyeyi buluyordu (2 Ekim 2026).
   *
   * Güvenli, çünkü her tablonun imleci kendi (bkz. `state.ts`) ve yerel
   * tablolar arasında yabancı anahtar yok — yolcu, vardiyasından önce
   * inse de bir şey kırılmıyor. Yazmalar senkron işlemlerde; JavaScript
   * tek iş parçacığında koştuğu için iki tablonun yazması iç içe geçmiyor.
   */
  const drained = await Promise.all(SYNC_TABLES.map(async (table) => {
    try {
      return await pullTable(supabase, userId, table, guard, now, limits, result);
    } catch (error) {
      if (isSessionChanged(error)) throw error;
      // Yalnızca BU tablo durur; diğerlerinin imleci bağımsız.
      result.errors.push(`${table}: ${describe(error)}`);
      return false;
    }
  }));

  result.complete = drained.every(Boolean) && result.errors.length === 0;
  if (result.complete) finishRecovery(userId);
  return result;
}

interface PageLimits { pageSize: number; maxPages: number }

/** Tabloyu sayfa sayfa boşaltır; sonuna kadar indiyse `true`. */
async function pullTable(
  supabase: SupabaseClient,
  userId: string,
  table: SyncTable,
  guard: SyncGuard,
  now: number,
  limits: PageLimits,
  result: PullResult,
): Promise<boolean> {
  const recovering = !isTableRecovered(userId, table);
  const stored = getPullProgress(userId, table);
  let high = stored.key;
  let drained = stored.drained;
  let from = drained ? lookbackKey(high, LOOKBACK_MS) : high;
  let received = 0;

  for (let page = 0; page < limits.maxPages; page += 1) {
    guard();
    /**
     * `user_id` süzgeci RLS'in üstüne EK bir güvence. RLS zaten
     * başkasının satırını vermiyor; ama aynı cihazda birden fazla
     * hesap kullanılmışsa yerel veritabanında başka kullanıcının
     * satırları duruyor olabilir ve onların üzerine yazmamalıyız.
     */
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      // `or` bunu zaten gerektiriyor; ayrıca yazılması Postgres'in
      // (user_id, server_updated_at) index'inde aralık taraması yapmasını
      // sağlıyor — yoksa her tur hesabın bütün satırlarını tarayabilir.
      .gte('server_updated_at', from.ts)
      .or(keyFilter(from))
      .order('server_updated_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(limits.pageSize);
    guard();
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Record<string, unknown>[];
    const isLast = rows.length < limits.pageSize;
    const last = rows.length > 0 ? keyOf(rows[rows.length - 1]) : null;
    const next = last ? maxKey(high, last) : high;
    const write = compareKeys(next, high) > 0 || (isLast && !drained);

    // Satırlar ve imleç AYNI işlemde: biri yazılıp diğeri yazılmazsa
    // ya kayıt atlanır ya da boşuna yeniden iner.
    getDb().transaction(() => {
      applyRows(table, rows, userId, recovering, now, result);
      if (write) setPullProgress(userId, table, { key: next, drained: isLast });
    });
    high = next;
    if (write) drained = isLast;
    received += rows.length;
    if (rows.length > 0) reportPullProgress({ userId, table, rows: received });

    if (isLast) {
      if (recovering) result.requeued += finishTableRecovery(userId, table, now);
      return true;
    }
    from = last as PullKey;
  }

  // Sayfa sınırı: sonraki çağrı pencereye dönmeden tam buradan sürmeli.
  if (drained) setPullProgress(userId, table, { key: high, drained: false });
  return false;
}

/**
 * Satırın imleç anahtarı. Damga HAM metin olarak saklanır; çözümlenemiyorsa
 * imleç ilerlemez, tablo hata verir.
 */
function keyOf(row: Record<string, unknown>): PullKey {
  const ts = String(row.server_updated_at ?? '');
  if (tsMicros(ts) === null) throw new Error(`sunucu damgası çözümlenemedi: ${ts}`);
  return { ts, id: String(row.id) };
}

/**
 * Gelen satırları yerele yazar. Çağıranın işlemi içinde çalışır.
 *
 * ÇAKIŞMA KURALI: yerel `updated_at` gelenden BÜYÜKSE yazma atlanır.
 * Gönderim çekmeden önce çalıştığı için normalde bu olmaz; ama gönderim
 * başarısız olduysa cihazda henüz iletilmemiş daha yeni bir düzeltme
 * duruyor olabilir ve onu ezmek sürücünün yazdığını yok etmek olurdu.
 *
 * İÇERİK AYNIYSA YAZILMAZ: geriye bakış penceresi her tur aynı satırları
 * yeniden indiriyor; her birini yeniden yazmak değişiklik dinleyicisini
 * tetikler ve bütün ekranlar boşuna yeniden sorgulanırdı.
 *
 * Yazma `outbox`'a DÜŞMEZ: bu satır buluttan geldi, geri göndermek
 * sonsuz bir gidiş-geliş üretirdi.
 */
function applyRows(
  table: SyncTable,
  rows: readonly Record<string, unknown>[],
  userId: string,
  recovering: boolean,
  now: number,
  result: PullResult,
): void {
  const client = getDb().$client;
  const columns = localColumns(table);

  for (const remote of rows) {
    const id = String(remote.id);
    if (recovering) noteSeen(userId, table, id);

    const local = client.getFirstSync<Record<string, unknown>>(
      `SELECT * FROM "${table}" WHERE id = ?`, [id],
    );

    if (local && Number(local.updated_at) > Number(remote.updated_at)) {
      result.skippedStale += 1;
      if (recovering && local.user_id === userId
        && requeueNewerLocal(table, id, local.deleted_at, now)) {
        result.requeued += 1;
      }
      continue;
    }

    const row = toLocalRow(table, remote, columns);
    if (local && sameContent(local, row)) {
      result.unchanged += 1;
      continue;
    }

    const names = Object.keys(row);
    const assignments = names
      .filter((c) => c !== 'id')
      .map((c) => `"${c}" = excluded."${c}"`)
      .join(', ');

    client.runSync(
      `INSERT INTO "${table}" (${names.map((c) => `"${c}"`).join(',')})
       VALUES (${names.map(() => '?').join(',')})
       ON CONFLICT(id) DO UPDATE SET ${assignments}`,
      names.map((c) => row[c] as never),
    );
    result.applied += 1;
  }
}

function sameContent(local: Record<string, unknown>, incoming: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(incoming)) {
    const current = local[key];
    if (current == null || value == null) {
      if (current != null || value != null) return false;
      continue;
    }
    if (String(current) !== String(value)) return false;
  }
  return true;
}

/**
 * Yerel tablonun sütunları — `PRAGMA table_info`, tablo başına bir kez.
 * Şema yalnızca açılıştaki migration'larla değişiyor.
 */
const columnCache = new Map<string, ReadonlySet<string>>();

function localColumns(table: string): ReadonlySet<string> {
  let columns = columnCache.get(table);
  if (!columns) {
    columns = new Set(getDb().$client
      .getAllSync<{ name: string }>('SELECT name FROM pragma_table_info(?)', [table])
      .map((c) => c.name));
    columnCache.set(table, columns);
  }
  return columns;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
