/**
 * Senkron durumu — çekme imleçleri ve son sonuç.
 *
 * `sync_state` YEREL KALIR, buluta gitmez: imleç cihaza özgüdür. İki
 * cihaz aynı imleci paylaşsaydı, biri çektiğinde diğeri aynı kayıtları
 * hiç görmezdi.
 *
 * HER ANAHTAR HESABA BAĞLI. Eskiden tek bir imleç ve tek bir "son başarı"
 * vardı: aynı cihazda A'dan çıkıp B ile girildiğinde B, A'nın imlecinden
 * devam ediyor ve A'nın son damgasından eski bütün kayıtlarını hiç
 * indirmiyordu; Profil de A'nın yedek durumunu B'ye gösteriyordu.
 */

import { eq, like } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { syncState } from '@/db/schema';
import { PULL_START, type PullKey, tsMicros } from './cursor';
import { pendingCount, stuckCount } from './push';
import { SYNC_TABLES } from './tables';

export function readState(key: string): string | null {
  const row = getDb().select({ value: syncState.value })
    .from(syncState).where(eq(syncState.key, key)).get();
  return row?.value ?? null;
}

export function writeState(key: string, value: string | null): void {
  getDb().insert(syncState)
    .values({ key, value, updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: syncState.key,
      set: { value, updatedAt: Date.now() },
    })
    .run();
}

/**
 * Tablo + hesap başına çekme imleci.
 *
 * Tablo başına, çünkü tek ortak imleç bir tablonun hatasında bütün
 * tabloları durduruyor, tur ortasında daha önce okunmuş bir tabloya
 * yazılan kaydı da atlatıyordu (imleç, sonra okunan tablonun damgasına
 * taşınıyordu).
 */
const pullKeyName = (userId: string, table: string) => `pull:${userId}:${table}`;

/** Bir tablonun çekme durumu: imleç ve son çağrıda sonuna kadar inip inmediği. */
export interface PullProgress {
  key: PullKey;
  /**
   * Son çağrı tablonun SONUNA kadar indi mi? İndiyse sonraki çağrı
   * geriye bakış penceresinden başlar. İnmediyse (sayfa sınırı) tam
   * kaldığı yerden devam eder — yoksa pencere sayfa bütçesinden büyük
   * olduğunda her çağrı aynı satırları okuyup hiç ilerlemezdi.
   */
  drained: boolean;
}

/**
 * Hiç çekilmemişse başlangıç döner — ilk senkron her şeyi indirir. Bu
 * cihaz değiştirme senaryosunun ta kendisi: yeni telefonda veritabanı
 * boş ve tüm geçmişin inmesi gerekiyor.
 *
 * Okunamayan kayıt da başlangıç sayılır: fazladan indirmek zararsız,
 * atlamak geri dönüşsüz.
 */
export function getPullProgress(userId: string, table: string): PullProgress {
  const raw = readState(pullKeyName(userId, table));
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<PullKey> & { drained?: unknown };
      if (typeof parsed.ts === 'string' && typeof parsed.id === 'string'
        && tsMicros(parsed.ts) !== null) {
        return { key: { ts: parsed.ts, id: parsed.id }, drained: parsed.drained !== false };
      }
    } catch {
      // Aşağıda başlangıca düşülüyor.
    }
  }
  return { key: PULL_START, drained: true };
}

export function setPullProgress(userId: string, table: string, progress: PullProgress): void {
  writeState(pullKeyName(userId, table), JSON.stringify({
    ts: progress.key.ts, id: progress.key.id, drained: progress.drained,
  }));
}

export function getPullKey(userId: string, table: string): PullKey {
  return getPullProgress(userId, table).key;
}

/**
 * Hesabın çekme imleçlerini sıfırlar — bir sonraki senkron her şeyi
 * baştan indirir.
 *
 * Yerel veriyi silmez. Kayıp bir kaydın buluttan geri gelmesi gerektiğinde
 * ya da imlecin bozulduğundan şüphelenildiğinde kullanılır.
 */
export function resetPullCursor(userId: string): void {
  getDb().delete(syncState).where(like(syncState.key, `pull:${userId}:%`)).run();
}

const lastSuccessName = (userId: string) => `last_success_at:${userId}`;
const downloadedName = (userId: string) => `downloaded:${userId}`;

/**
 * Bu cihazda hesabın kayıtları bir kez sonuna kadar indi — açılış
 * kapısı artık beklemez (bkz. `lib/setup-gate.ts`).
 *
 * "Son yedekleme"den AYRI: o, kuyruğun da boş olmasını istiyor. Kuyrukta
 * gönderilemeyen bir kayıt varken bile buluttaki her şey inmiş olabilir
 * ve sürücü bunun için kapıda bekletilmemeli.
 */
export function markDownloaded(userId: string, at: number = Date.now()): void {
  if (readState(downloadedName(userId)) == null) writeState(downloadedName(userId), String(at));
}

/**
 * İşaret bu sürümle geldi; daha önce tam yedek almış cihazlar da inmiş
 * sayılır — güncelleme sonrası ilk açılışta boşuna beklenmesin.
 */
function isDownloaded(userId: string): boolean {
  return readState(downloadedName(userId)) != null || readState(lastSuccessName(userId)) != null;
}
const lastErrorName = (userId: string) => `last_error:${userId}`;

/**
 * Tam bir yedek: bu hesabın kuyruğu boşaldı ve buluttaki her şey indi.
 * Yalnızca bu koşulda yazılır — "son yedekleme" sürücüye bir söz.
 */
export function markSuccess(userId: string, at: number = Date.now()): void {
  writeState(lastSuccessName(userId), String(at));
  writeState(lastErrorName(userId), null);
}

export function markError(userId: string, message: string, at: number = Date.now()): void {
  writeState(lastErrorName(userId), JSON.stringify({ at, message: message.slice(0, 500) }));
}

export interface SyncError {
  at: number;
  message: string;
}

export interface SyncStatus {
  /** Son TAM yedek: kuyruk boştu ve bulut sonuna kadar indi. */
  lastSuccessAt: number | null;
  /** Son başarısız turun hatası; sonraki başarıda temizlenir. */
  lastError: SyncError | null;
  /** Bu hesabın buluta gitmeyi bekleyen kayıtları. */
  pending: number;
  /** Bekleyenlerden deneme eşiğini aşmış, büyük ihtimalle reddedilenler. */
  stuck: number;
  /** Bu cihazda kayıtlar en az bir kez sonuna kadar indi mi? */
  downloaded: boolean;
}

export function getSyncStatus(userId: string): SyncStatus {
  const success = readState(lastSuccessName(userId));
  return {
    lastSuccessAt: success ? Number(success) : null,
    lastError: parseError(readState(lastErrorName(userId))),
    pending: pendingCount(userId),
    stuck: stuckCount(userId),
    downloaded: isDownloaded(userId),
  };
}

function parseError(raw: string | null): SyncError | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SyncError>;
    if (typeof parsed.at === 'number' && typeof parsed.message === 'string') {
      return { at: parsed.at, message: parsed.message };
    }
  } catch {
    // Aşağıda ham metin olarak dönülüyor.
  }
  return { at: 0, message: raw };
}

/** Test ve tanı için: hesabın bütün tablo imleçleri. */
export function pullKeys(userId: string): Record<string, PullKey> {
  return Object.fromEntries(SYNC_TABLES.map((t) => [t, getPullKey(userId, t)]));
}
