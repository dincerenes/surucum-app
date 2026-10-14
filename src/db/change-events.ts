/**
 * Veritabanı değişiklik olaylarının süzgeci — YERLİ BAĞIMLILIĞI YOK.
 *
 * `expo-sqlite` import etmiyor; böylece `node --test` altında doğrudan
 * koşabiliyor. Bu dosyadaki hata bir kez arayüzün tamamını sessizce
 * dondurdu, bir daha testsiz bırakılmıyor.
 */

export const DATABASE_NAME = 'surucum.db';

/** `addDatabaseChangeListener` olayının bize gereken alanları. */
export interface DatabaseChangeEventLike {
  /**
   * SQLite'ın MANTIKSAL veritabanı adı — neredeyse her zaman `"main"`.
   * Dosya adı DEĞİL; süzgeçte kullanılmaz.
   */
  databaseName?: string | null;
  /** Açık veritabanının dosya yolu. Süzgeç buna bakar. */
  databaseFilePath?: string | null;
}

/**
 * Olay bizim veritabanımızdan mı geliyor?
 *
 * DOSYA YOLUNA bakılır, `databaseName`'e DEĞİL. `databaseName` `"main"`
 * geldiği için ona bakan bir süzgeç HER OLAYI eler: veri doğru yazılır,
 * ekran hiç güncellenmez, hata da vermez.
 *
 * Yol boşsa olay GEÇİRİLİR. Fazladan bir okuma ucuz; kaçırılan bir
 * güncelleme sürücünün gördüğü sayıyı yanlış yapar.
 */
export function isOwnDatabaseEvent(
  event: DatabaseChangeEventLike,
  databaseName: string = DATABASE_NAME,
): boolean {
  if (!event.databaseFilePath) return true;
  return event.databaseFilePath.includes(databaseName);
}

/**
 * Bildirimlerin toplanma penceresi.
 *
 * SQLite her satır için ayrı olay yolluyor. Yeni telefonda 600 kayıt inince
 * 600 olay geliyor ve her ekran her birinde gün özetini baştan
 * hesaplıyordu: ana sayfa iki saniye "0,00 ₺"de donup kaldı (2 Ekim 2026).
 * Bir kare süresi: sürücünün yazdığı tutar yine "o an" görünüyor.
 */
export const CHANGE_BATCH_MS = 16;

type Schedule = (run: () => void, ms: number) => unknown;

/**
 * Art arda gelen değişiklik olaylarını tek bildirime indirir.
 *
 * Pencere içinde kaç olay gelirse gelsin her abone bir kez çağrılır.
 * Pencere ilk olayla açılır, kayan değildir: sürekli yazma olsa bile
 * ekran en geç bir pencere sonra güncellenir.
 */
export function createChangeBatcher(
  schedule: Schedule = (run, ms) => setTimeout(run, ms),
) {
  const subscribers = new Set<() => void>();
  let pending = false;

  return {
    subscribe(listener: () => void): () => void {
      subscribers.add(listener);
      return () => { subscribers.delete(listener); };
    },
    notify(): void {
      if (pending) return;
      pending = true;
      schedule(() => {
        pending = false;
        for (const listener of [...subscribers]) listener();
      }, CHANGE_BATCH_MS);
    },
  };
}
