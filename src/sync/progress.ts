/**
 * Çekme ilerlemesi — ilk açılıştaki yükleme ekranı için.
 *
 * Yalnızca BİLGİ: hiçbir karar buna bakmıyor. Kapının ne zaman açılacağı
 * tur sonucundan ve `sync_state`'ten okunuyor (bkz. `state.ts`); bu modül
 * sürücüye beklerken "bir şey oluyor" demek için var.
 */

import type { SyncTable } from './tables';

export interface PullProgressEvent {
  userId: string;
  /** Şu an inen tablo. */
  table: SyncTable;
  /** Bu tablodan bu çağrıda inen satır. */
  rows: number;
}

type Listener = (event: PullProgressEvent) => void;

let listeners: Listener[] = [];

export function onPullProgress(listener: Listener): () => void {
  listeners.push(listener);
  return () => { listeners = listeners.filter((l) => l !== listener); };
}

export function reportPullProgress(event: PullProgressEvent): void {
  for (const listener of listeners) listener(event);
}
