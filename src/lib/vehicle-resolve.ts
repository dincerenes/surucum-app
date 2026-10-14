/**
 * Hangi araçla çalışılıyor — TEK ÇÖZÜMLEME YOLU.
 *
 * İki ayrı soru var ve ikisi karıştırılınca kayıtlar yanlış araca
 * yazılıyordu:
 *
 * - SONRAKİ vardiyanın aracı: Araçlarım'da seçilen (ayardaki varsayılan).
 * - ŞU ANKİ vardiyanın aracı: açık vardiya hangi araçla açıldıysa o.
 *
 * Eskiden ikisi birbirinden bağımsız çözülüyordu: A ile vardiya açıkken
 * Araçlarım'da B'ye dokunan sürücünün seferi A vardiyasına ama B aracına,
 * yakıtı B'ye yazılıyor; vardiya sonu B'nin tüketim ve fiyatıyla açılıp
 * A'nın vardiyasına kopyalanıyordu. Artık seçim SONRAKİ vardiyada geçerli;
 * açık vardiya kendi aracında kalıyor.
 *
 * Veritabanı bilmez; listeyi ve kimlikleri alır, araç seçer.
 */

export interface VehicleLike {
  id: string;
}

/**
 * Seçili araç: ayardaki varsayılan listede (aktifler arasında) varsa o,
 * yoksa listenin ilki. Varsayılan pasifleştirilmiş olabilir.
 *
 * Bu kural iki yerde ayrı ayrı yazılmıştı ve ayrışmışlardı: vardiya ilk
 * araca bağlanırken Araçlarım ekranı ham kimliğe bakıp hiçbir karta
 * rozet basmıyordu.
 */
export function resolveActiveVehicle<V extends VehicleLike>(
  vehicles: readonly V[], defaultVehicleId: string | null | undefined,
): V | null {
  return vehicles.find((v) => v.id === defaultVehicleId) ?? vehicles[0] ?? null;
}

export interface WorkingVehicle<V> {
  /** Şu an kayıtların yazılacağı araç: açık vardiyanınki, yoksa seçili. */
  working: V | null;
  /** Bir sonraki vardiyanın aracı — Araçlarım'daki seçim. */
  next: V | null;
  /** Açık vardiya seçili araçtan başka bir araçla mı sürüyor? */
  diverged: boolean;
}

/**
 * @param active   aktif araçlar (Araçlarım listesi)
 * @param openShiftVehicle açık vardiyanın aracı — pasif olsa da verilir;
 *   vardiyası süren aracın kayıtları başka araca kaymamalı.
 */
export function resolveWorkingVehicle<V extends VehicleLike>(
  active: readonly V[],
  defaultVehicleId: string | null | undefined,
  openShiftVehicle: V | null | undefined,
): WorkingVehicle<V> {
  const next = resolveActiveVehicle(active, defaultVehicleId);
  const working = openShiftVehicle ?? next;
  return {
    working,
    next,
    diverged: openShiftVehicle != null && next?.id !== openShiftVehicle.id,
  };
}
