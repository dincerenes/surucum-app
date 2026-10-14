/**
 * Özellik yetkileri.
 *
 * v1'de uygulama tamamen ücretsiz ve bu servis her zaman `true` döner.
 * Yine de baştan konuyor: ekranlar özelliği doğrudan açıp kapatmak yerine
 * `hasFeature()` sorar. İleride bir ödeme katmanı gelirse yalnızca bu
 * dosya değişir — kırk ekran değil.
 *
 * Ödeme altyapısı (RevenueCat vb.) v1'de YOK. Buraya bir istemci
 * eklendiğinde `hasFeature` eşzamanlı kalmalı; yetki durumu önbellekten
 * okunmalı, ekran çizimi ağ çağrısı beklememeli.
 */

export const FEATURES = [
  'unlimitedHistory',  // 30 günden eski kayıtlara erişim
  'advancedReports',   // kârlılık ısı haritası, kaynak karşılaştırma
  'export',            // Excel / PDF dışa aktarım
  'cloudBackup',       // bulut yedek ve cihaz değiştirme
  'multiVehicle',      // birden fazla araç
] as const;

export type Feature = (typeof FEATURES)[number];

export function hasFeature(_feature: Feature): boolean {
  // v1: her şey açık.
  return true;
}

/** Kilitli bir özelliğe dokunulduğunda gösterilecek metin. v1'de kullanılmıyor. */
export function featureLockMessage(_feature: Feature): string | null {
  return null;
}
