/**
 * Açılış kapısı — sürücü kuruluma mı, yükleme ekranına mı, uygulamaya mı
 * gidecek?
 *
 * ESKİ HATA 1: karar yalnızca "cihazda araç var mı" sorusuna bakıyordu.
 * Yeni telefonda, uygulama yeniden kurulunca ya da cihaz verisi
 * silinince veritabanı boş açılıyor; araçlar buluttan henüz inmeden
 * kapı "araç yok" deyip kurulumu açıyordu. Sürücü aracını yeniden
 * giriyor, bulut da eskisini indirince aynı araç iki kez oluyordu.
 *
 * ESKİ HATA 2 (2 Ekim 2026): araç inince kapı hemen açılıyordu. Araç
 * ilk inen tablolardan; vardiyalar, yolcular ve giderler arkasından
 * geliyor. Sürücü birkaç saniye yarım veriyle hesaplanmış rakamlar
 * görüyordu: ciro 0 ₺, verimlilik puanı 36 iken bir anda 64.
 *
 * Şimdi kapı, bu cihazda bu hesabın kayıtları EN AZ BİR KEZ sonuna kadar
 * inene kadar açılmıyor. İndikten sonra araç varsa uygulama, yoksa
 * kurulum (hesap gerçekten yeni). Bu bekleme cihaz başına bir kez;
 * sonraki açılışlar hiç beklemiyor.
 */

export type SetupGate =
  /** Kayıtlar indi (ya da sürücü beklemeyi atladı), araç var: uygulama açılır. */
  | 'ready'
  /** Kayıtlar buluttan iniyor. */
  | 'waiting'
  /** Bulut sorulamadı (bağlantı yok ya da hata); karar verilemiyor. */
  | 'sync_failed'
  /** Bulut da boş: hesap yeni, kurulum açılır. */
  | 'setup';

export interface SetupGateInput {
  hasVehicle: boolean;
  /** Bu cihazda bu hesabın kayıtları en az bir kez sonuna kadar indi mi? */
  downloaded: boolean;
  /** Son senkron turu hatayla mı bitti? */
  syncFailed: boolean;
  /**
   * Sürücü beklemeyi atladı mı? Araç varsa "Beklemeden aç", yoksa
   * "Yeni hesabım, kuruluma geç" düğmesiyle.
   */
  skipWait: boolean;
}

export function resolveSetupGate(input: SetupGateInput): SetupGate {
  if (input.downloaded) return input.hasVehicle ? 'ready' : 'setup';
  if (input.skipWait) return input.hasVehicle ? 'ready' : 'setup';
  return input.syncFailed ? 'sync_failed' : 'waiting';
}
