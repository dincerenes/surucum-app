/**
 * Senkron işçisi.
 *
 * ARAYÜZ BUNU BEKLEMEZ. Yazma yerel SQLite'a düşer, ekran anında
 * güncellenir; bu modül arka planda çalışır. Senkron hiç çalışmasa da
 * uygulama eksiksiz işler — bulut yedek ve cihaz değiştirme içindir,
 * çalışmanın önkoşulu değil.
 *
 * Turun kendisi `turn.ts`'te; burada yalnızca ortam var: bulut istemcisi,
 * oturum ve aynı anda tek tur kuralı.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase, isCloudConfigured } from '@/lib/supabase';
import { guardFrom, type SyncGuard } from './guard';
import { type SyncOutcome, type SyncSkipReason, syncTurn } from './turn';

export type { SyncOutcome, SyncSkipReason };

/**
 * Aynı anda iki tur çalışmasını engeller.
 *
 * Uygulama öne geldiğinde ve zamanlayıcı tetiklendiğinde ikisi birden
 * başlayabilir; ikinci tur ilkinin sildiği kuyruk kayıtlarını okuyup
 * aynı satırları iki kez göndermeye çalışırdı.
 */
let inFlight: Promise<SyncOutcome> | null = null;

export interface RunSyncOptions {
  /**
   * Geçici hatalardan doğan beklemeleri iptal eder.
   *
   * Uygulama öne geldiğinde ve sürücü elle senkron istediğinde `true`
   * verilir: ikisi de bağlantının döndüğüne dair güçlü işaret. Otomatik
   * aralık turlarında `false` — orada beklemenin amacı zaten ağ kapalıyken
   * boşuna istek atmamak.
   */
  force?: boolean;
}

export function runSync(options: RunSyncOptions = {}): Promise<SyncOutcome> {
  if (inFlight) return Promise.resolve(skipped('already_running'));

  inFlight = execute(options).finally(() => { inFlight = null; });
  return inFlight;
}

function skipped(reason: SyncSkipReason): SyncOutcome {
  return { ran: false, skipped: reason, errors: [], pending: 0, more: false };
}

async function execute(options: RunSyncOptions): Promise<SyncOutcome> {
  const supabase = isCloudConfigured() ? getSupabase() : null;
  if (!supabase) return skipped('cloud_not_configured');

  /**
   * Hesap TURUN BAŞINDA bir kez belirlenir ve tur boyunca taşınır.
   * Oturum arada değişirse bekçi turu durdurur (bkz. `guard.ts`).
   */
  const userId = await currentUserId(supabase);
  if (!userId) return skipped('not_signed_in');

  const watch = watchSession(supabase, userId);
  try {
    return await syncTurn(supabase, userId, { force: options.force, guard: watch.guard });
  } finally {
    watch.stop();
  }
}

async function currentUserId(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session?.user.id ?? null;
}

/**
 * Tur boyunca oturumu izler. Çıkış, başka hesapla giriş ya da oturumun
 * kaybolması — hesap turun başladığı hesap değilse bekçi düşer. Jeton
 * yenilemesi aynı hesabı taşıdığı için turu durdurmaz.
 */
function watchSession(
  supabase: SupabaseClient, userId: string,
): { guard: SyncGuard; stop: () => void } {
  let current = true;
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user.id !== userId) current = false;
  });
  return {
    guard: guardFrom(() => current),
    stop: () => data.subscription.unsubscribe(),
  };
}

export { pendingCount } from './push';
export { getSyncStatus, resetPullCursor } from './state';
