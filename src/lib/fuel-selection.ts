/**
 * Araç kurulumu ve araç düzenlemedeki yakıt çiplerinin kuralı — TEK YER.
 *
 * Seçim TEKTİR; birlikte seçilebilen tek çift BENZİN + LPG (dönüşümlü
 * LPG'li araç iki yakıtı da yakıyor). Eskiden çipler serbestçe açılıp
 * kapanıyordu ve "Benzin + Motorin" gibi var olmayan bir araç
 * kurulabiliyordu; vardiya sonunun tüketim ve fiyat ön dolgusu o zaman
 * hangi yakıttan geleceğini bilemiyordu.
 *
 * Seçim hiçbir zaman BOŞALMAZ: tek seçili çipe yeniden basmak onu
 * kaldırmıyor. Yakıt tipi olmayan araç kaydedilemiyor; boş seçim sürücüye
 * yalnızca gri bir "Devam" butonu gösterirdi.
 *
 * Veritabanı bilmez; seçimi alır, yenisini döner.
 */

import type { FuelType } from '../db/schema/_shared.ts';

/** Birlikte seçilebilen tek çift. */
const COMBINABLE: readonly FuelType[] = ['gasoline', 'lpg'];

function canCombine(a: FuelType, b: FuelType): boolean {
  return a !== b && COMBINABLE.includes(a) && COMBINABLE.includes(b);
}

/** `tapped` çipine basıldıktan sonraki seçim. */
export function toggleFuelSelection(
  current: readonly FuelType[],
  tapped: FuelType,
): FuelType[] {
  if (current.includes(tapped)) {
    const rest = current.filter((f) => f !== tapped);
    return rest.length > 0 ? rest : [...current];
  }
  return [...current.filter((f) => canCombine(f, tapped)), tapped];
}
