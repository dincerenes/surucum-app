/**
 * Aracın yakıt tipi satırlarından hangisinin okunacağı — TEK KURAL.
 *
 * Ön dolgu (tüketim, litre fiyatı), Profil'deki "son yakıt" satırı ve
 * yakıt ekranının varsayılan çipi hep aynı satırı göstermeli. Eskiden
 * sorgular yalnızca `isPrimary`'ye göre sıralıyordu: araçtan çıkarılan
 * tip yumuşak silinirken birincil işaretini koruyordu, yenisi de
 * birincil ekleniyordu — eşit anahtarlı iki satırdan hangisinin
 * geleceğini SQLite garanti etmiyor ve gözlenen, silinmiş LPG satırıydı.
 * Benzinli araçta vardiya sonu LPG tüketimi ve fiyatıyla açılıyordu.
 *
 * Veritabanı bilmez; satırları alır, birini seçer.
 */

export interface FuelTypeRowLike {
  id: string;
  isPrimary: boolean;
  createdAt: number;
  deletedAt: number | null;
}

/**
 * Sıralama: birincil önce, sonra en eski, eşitlikte kimlik.
 *
 * Kimlik son anahtar: iki cihazda aynı anda eklenen iki satırın
 * `createdAt`'i eşit olabilir ve sonuç yine de her okumada aynı olmalı.
 */
export function compareFuelTypes(a: FuelTypeRowLike, b: FuelTypeRowLike): number {
  if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Okunacak satır. Silinmiş satır ASLA seçilmez; birincil yoksa ilk tip,
 * hiç satır yoksa `null` (ön dolgu boş kalır, uydurulmaz).
 */
export function pickPrimaryFuelType<T extends FuelTypeRowLike>(rows: readonly T[]): T | null {
  const alive = rows.filter((r) => r.deletedAt == null);
  if (alive.length === 0) return null;
  return [...alive].sort(compareFuelTypes)[0];
}

/**
 * Litre fiyatı aracın "son bilinen fiyatı" olarak hatırlanmaya değer mi?
 *
 * Fiyat yakıt ekranında isteğe bağlı: girilmeyen fiyat dolum satırında
 * 0 olarak duruyor (sütun boş olamıyor). O 0 araca yayılırsa bir önceki
 * doğru fiyat kalıcı olarak siliniyor ve vardiya sonunda alan boş
 * geliyordu. Negatif fiyat da aynı yoldan ön dolguya "-40" yazıyordu.
 */
export function isKnownUnitPrice(price: number | null | undefined): price is number {
  return price != null && Number.isFinite(price) && price > 0;
}
