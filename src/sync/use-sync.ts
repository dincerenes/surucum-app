/**
 * Senkron zamanlayıcısını uygulamanın yaşam döngüsüne bağlayan kanca.
 *
 * Oturum açıkken çalışır, kapanınca durur. Oturum yokken zamanlayıcıyı
 * açık bırakmak her turda "not_signed_in" ile dönen boş çağrılar demek
 * olurdu.
 */

import { useEffect, useState } from 'react';
import { type SyncError, getSyncStatus } from './state';
import { onSyncResult, startSyncScheduler } from './scheduler';
import type { SyncOutcome } from './worker';

export interface SyncSnapshot {
  /** Bu hesabın kuyrukta bekleyen kaydı — arayüzdeki "senkronlanmadı" rozeti. */
  pending: number;
  /** Bekleyenlerden büyük ihtimalle kalıcı reddedilenler. */
  stuck: number;
  lastSuccessAt: number | null;
  lastError: SyncError | null;
  /** Son turda gerçekten ağa çıkıldı mı? */
  lastRan: boolean;
  /** Bu cihazda kayıtlar en az bir kez sonuna kadar indi mi? */
  downloaded: boolean;
}

const EMPTY: SyncSnapshot = {
  pending: 0, stuck: 0, lastSuccessAt: null, lastError: null, lastRan: false, downloaded: false,
};

function snapshot(userId: string | null, lastRan = false): SyncSnapshot {
  if (!userId) return EMPTY;
  return { ...getSyncStatus(userId), lastRan };
}

/**
 * Zamanlayıcıyı oturumdaki hesap için çalıştırır ve son durumu döner.
 *
 * Hesap değişince zamanlayıcı durup yeniden başlar ve durum yeni hesabın
 * kendi anahtarlarından okunur — A'nın yedek durumu B'ye gösterilmez.
 *
 * Kanca durumu yalnızca tur bittiğinde güncelliyor; her yazmada değil.
 * Sürücü sefer eklediğinde ekranın kendisi zaten anında güncelleniyor —
 * rozet birkaç saniye geç kalabilir, arayüz senkronu beklemiyor.
 */
export function useSync(userId: string | null): SyncSnapshot {
  const [state, setState] = useState(() => ({ userId, snapshot: snapshot(userId) }));

  // Hesap değişti: önceki hesabın durumu bir kare bile gösterilmesin.
  if (state.userId !== userId) setState({ userId, snapshot: snapshot(userId) });

  useEffect(() => {
    if (!userId) return;

    const stop = startSyncScheduler();
    const unsubscribe = onSyncResult((outcome: SyncOutcome) => {
      setState({ userId, snapshot: snapshot(userId, outcome.ran) });
    });

    return () => { unsubscribe(); stop(); };
  }, [userId]);

  return state.snapshot;
}
