/**
 * Tek senkron turu — gönder, çek, sonucu hesaba işaretle.
 *
 * Ortamdan bağımsız: oturumu bulmak ve bekçiyi kurmak `worker.ts`'in işi,
 * zamanlamak `scheduler.ts`'in. Bu yüzden tur, testlerde taklit bir
 * Supabase istemcisiyle olduğu gibi koşabiliyor.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { NO_GUARD, type SyncGuard, isSessionChanged } from './guard';
import { type PullResult, pullChanges } from './pull';
import {
  type PushResult, clearTransientBackoff, pendingCount, pushOutbox, readyCount,
} from './push';
import { isStaleDevice, markPulled, purgeLocalTombstones, resetForFullPull } from './retention';
import { markDownloaded, markError, markSuccess } from './state';

export type SyncSkipReason =
  | 'cloud_not_configured'
  | 'not_signed_in'
  | 'already_running'
  | 'session_changed';

export interface SyncOutcome {
  ran: boolean;
  skipped?: SyncSkipReason;
  /** Turun başladığı hesap. */
  userId?: string;
  push?: PushResult;
  pull?: PullResult;
  errors: string[];
  /** Turun hesabının kuyrukta kalan kaydı. */
  pending: number;
  /**
   * Bitmeyen iş kaldı: tur sırasında yeni kayıt girildi, kuyruk tek turda
   * boşalmadı, bulut sonuna kadar inmedi ya da oturum değişti. Zamanlayıcı
   * 90 saniye beklemeden yeni tur açar.
   */
  more: boolean;
}

export interface SyncTurnOptions {
  /** Geçici hatalardan doğan beklemeleri iptal et. */
  force?: boolean;
  /** Oturum tur ortasında değişirse turu durdurur. */
  guard?: SyncGuard;
}

export async function syncTurn(
  supabase: SupabaseClient, userId: string, options: SyncTurnOptions = {},
): Promise<SyncOutcome> {
  const guard = options.guard ?? NO_GUARD;

  try {
    guard();
    if (options.force) clearTransientBackoff(userId);

    /**
     * ÖNCE GÖNDER, SONRA ÇEK.
     *
     * Ters sırada, buluttan gelen eski bir sürüm cihazdaki gönderilmemiş
     * düzeltmenin üzerine yazabilirdi. Gönderim önce çalışınca yerel
     * değişiklikler sunucuya ulaşmış olur ve dönen kayıt zaten en günceli
     * taşır.
     */
    const push = await pushOutbox(supabase, userId, { guard });

    /**
     * Uzun süre çekmemiş cihaz baştan indirir — gönderimden SONRA, ki
     * kuyruktaki değişiklikler önce buluta ulaşsın (bkz. `retention.ts`).
     */
    guard();
    if (isStaleDevice(userId)) resetForFullPull(userId);

    const pull = await pullChanges(supabase, userId, { guard });
    guard();

    const errors = [...push.errors, ...pull.errors];
    const pending = pendingCount(userId);

    if (pull.complete) {
      markDownloaded(userId);
      markPulled(userId);
      purgeLocalTombstones(userId);
    }

    /**
     * "Son yedekleme" yalnızca GERÇEKTEN tam bir yedekte yazılır: bu
     * hesabın kuyruğu boş ve buluttaki her şey indi. Hatasız ama yarım
     * kalan tur (sayfa sınırı, tur sırasında girilen kayıt) hiçbir şey
     * yazmaz; bir sonraki tur tamamlar.
     */
    if (errors.length > 0) markError(userId, errors.join(' · '));
    else if (pull.complete && pending === 0) markSuccess(userId);

    const more = errors.length === 0 && (readyCount(userId) > 0 || !pull.complete);

    return { ran: true, userId, push, pull, errors, pending, more };
  } catch (error) {
    if (isSessionChanged(error) || !stillCurrent(guard)) {
      // Hiçbir durum yazılmaz: bu turun sonucu artık kimseye ait değil.
      return {
        ran: false, skipped: 'session_changed', userId, errors: [],
        pending: pendingCount(userId), more: true,
      };
    }

    // Beklenmeyen (yerel) hata: tur çökmesin, sürücü yedeğin durduğunu görsün.
    const message = error instanceof Error ? error.message : String(error);
    markError(userId, message);
    return {
      ran: true, userId, errors: [message], pending: pendingCount(userId), more: false,
    };
  }
}

function stillCurrent(guard: SyncGuard): boolean {
  try {
    guard();
    return true;
  } catch {
    return false;
  }
}
