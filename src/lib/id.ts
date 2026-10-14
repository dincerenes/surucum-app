import { v7 as uuidv7 } from 'uuid';

/**
 * Kayıt kimliği. Cihazda üretilir — kayıt çevrimdışıyken de kalıcı
 * kimliğine sahip olur ve ilişkiler ağ beklemeden kurulabilir.
 *
 * UUID v7 seçildi çünkü baş kısmı zaman damgasıdır: üretilen kimlikler
 * kronolojik olarak sıralanır. Bu, SQLite'ta birincil anahtar index'inin
 * sona ekleme yapmasını sağlar (v4'ün rastgeleliği index'i parçalar) ve
 * senkron kuyruğunda doğal sıra verir.
 *
 * `v7()` ARGÜMANSIZ çağrılmalı: options verildiğinde uuid'in monotonik
 * sayaç dalı devre dışı kalıyor ve aynı milisaniyede üretilen kimlikler
 * sırasız çıkıyor.
 */
export function newId(): string {
  return uuidv7();
}

/** Kimliğin gömülü zaman damgasını okur — hata ayıklama ve sıralama için. */
export function idTimestamp(id: string): number | null {
  const hex = id.replace(/-/g, '').slice(0, 12);
  if (hex.length !== 12 || !/^[0-9a-f]{12}$/i.test(hex)) return null;
  return parseInt(hex, 16);
}
