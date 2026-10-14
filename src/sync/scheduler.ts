/**
 * Senkronu ne zaman çalıştıracağımıza karar veren katman.
 *
 * ARAYÜZ HİÇBİR ZAMAN BEKLEMEZ: burada tetiklenen turlar arka planda
 * koşuyor, ekran onları beklemiyor ve sonuçlarına bakmıyor. Senkron hiç
 * çalışmasa da uygulama eksiksiz işliyor.
 *
 * Ağ durumu dinlenmiyor — bunun için ek bir bağımlılık gerekiyor ve
 * kazandırdığı şeyi iki ucuz işaret zaten veriyor: uygulamanın öne
 * gelmesi ve düzenli aralık. Başarısız kayıtlar `outbox` içinde üstel
 * geri çekilmeyle bekliyor, yani ağ kapalıyken boşa istek atılmıyor.
 */

import { AppState, type AppStateStatus } from 'react-native';
import { type SyncOutcome, runSync } from './worker';

/**
 * Uygulama önplandayken tur aralığı.
 *
 * 90 saniye: sürücü sefer girdikten sonra kaydının buluta ulaşması için
 * makul, ama pil ve istek açısından da ucuz. Arayüz zaten beklemediği
 * için bundan daha sık olmasının kullanıcıya bir faydası yok.
 */
const FOREGROUND_INTERVAL_MS = 90_000;

/**
 * `requestSync` çağrılarının toplanma penceresi.
 *
 * Sürücü vardiya sonunda arka arkaya yakıt, gider ve kilometre giriyor;
 * her biri için ayrı tur açmak aynı kuyruğu üç kez taramak olurdu.
 */
const DEBOUNCE_MS = 3_000;

/**
 * Bitmeyen iş kalan turdan sonra yeni tura kadar beklenen süre.
 *
 * Yeni telefonda binlerce kayıt birkaç tura yayılıyor, tur sırasında
 * girilen kayıt da o turda gitmiyor; ikisi de 90 saniyelik aralığı
 * beklememeli. Art arda en fazla `MAX_FOLLOW_UPS` kez — bir hata turu
 * sonsuz bir döngüye çevirmesin.
 */
const FOLLOW_UP_MS = 2_000;
const MAX_FOLLOW_UPS = 20;

type Listener = (outcome: SyncOutcome) => void;

let intervalId: ReturnType<typeof setInterval> | null = null;
let debounceId: ReturnType<typeof setTimeout> | null = null;
let followUpId: ReturnType<typeof setTimeout> | null = null;
let followUps = 0;
let appStateSub: { remove: () => void } | null = null;
let listeners: Listener[] = [];
let running = false;

function fire(options: { force: boolean }): void {
  void runSync(options).then((outcome) => {
    for (const listener of listeners) listener(outcome);
    if (outcome.skipped === 'already_running') return;

    if (running && outcome.more && followUps < MAX_FOLLOW_UPS) {
      followUps += 1;
      scheduleFollowUp();
    } else {
      followUps = 0;
    }
  });
}

function scheduleFollowUp(): void {
  if (followUpId) clearTimeout(followUpId);
  followUpId = setTimeout(() => {
    followUpId = null;
    fire({ force: false });
  }, FOLLOW_UP_MS);
}

/**
 * Zamanlayıcıyı başlatır. Döndürdüğü fonksiyon durdurur.
 *
 * İki kez çağrılırsa ikincisi yok sayılır — React'in geliştirme modunda
 * efektleri iki kez çalıştırması yüzünden iki zamanlayıcı kurulmasın.
 */
export function startSyncScheduler(): () => void {
  if (running) return stopSyncScheduler;
  running = true;

  // Açılışta bir tur: uygulama kapalıyken biriken kayıtlar hemen gitsin.
  fire({ force: true });
  startInterval();

  appStateSub = AppState.addEventListener('change', handleAppState);
  return stopSyncScheduler;
}

export function stopSyncScheduler(): void {
  running = false;
  stopInterval();
  if (debounceId) { clearTimeout(debounceId); debounceId = null; }
  if (followUpId) { clearTimeout(followUpId); followUpId = null; }
  followUps = 0;
  appStateSub?.remove();
  appStateSub = null;
}

/**
 * Uygulama öne geldiğinde ZORLAYARAK senkronlar.
 *
 * Geri çekilme tavanı bir saat; sürücü kapsama alanına döndüğünde o kadar
 * beklememeli. Uygulamayı açmak bağlantının döndüğüne dair en güçlü işaret.
 *
 * Arka plana geçince aralık durduruluyor: iOS zamanlayıcıyı zaten askıya
 * alıyor, açık bırakmak öne dönüldüğünde birikmiş tetiklemelere yol açar.
 */
function handleAppState(state: AppStateStatus): void {
  if (state === 'active') {
    fire({ force: true });
    startInterval();
  } else {
    stopInterval();
  }
}

function startInterval(): void {
  stopInterval();
  intervalId = setInterval(() => fire({ force: false }), FOREGROUND_INTERVAL_MS);
}

function stopInterval(): void {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
}

/**
 * Yazma sonrası senkron ister — biriktirilerek.
 *
 * Ekranlar kayıt ekledikten sonra bunu çağırabilir. ÇAĞIRMAK ZORUNDA
 * DEĞİLLER: aralık turu kaydı nasıl olsa alır, bu yalnızca gecikmeyi
 * kısaltır. Bu yüzden veri katmanı bu modülü tanımıyor — bağımlılık tek
 * yönlü kalıyor.
 */
export function requestSync(): void {
  if (debounceId) clearTimeout(debounceId);
  debounceId = setTimeout(() => {
    debounceId = null;
    fire({ force: false });
  }, DEBOUNCE_MS);
}

/**
 * Hemen ve zorlayarak bir tur — sürücü "Tekrar dene"ye bastığında.
 * `runSync`'i doğrudan çağırmak dinleyicileri atlardı; ekran sonucu görmezdi.
 */
export function syncNow(): void {
  fire({ force: true });
}

/** Tur sonuçlarını dinler — arayüzdeki "senkronlanmadı" rozeti için. */
export function onSyncResult(listener: Listener): () => void {
  listeners.push(listener);
  return () => { listeners = listeners.filter((l) => l !== listener); };
}

export function isSchedulerRunning(): boolean {
  return running;
}
