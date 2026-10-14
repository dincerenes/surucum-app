/**
 * Tekil satırların birleştirilmesi.
 *
 * `app_settings` mantıken TEK SATIRDIR ama pratikte çoğalabiliyor ve bu
 * yaşanarak bulundu: sürücü yeni bir cihaza kurulum yapıp giriş yaptığında
 * `ensureSettings` çekme tamamlanmadan yerel satırı açıyor, hemen ardından
 * senkron buluttaki satırı (ya da satırları) indiriyor. Kimlik cihazda
 * üretildiği için ikisi aynı satır sayılmıyor.
 *
 * Sonuç sessiz ve kötü: `getSettings` sıralama yapmadığında rastgele bir
 * satır dönüyor. Dönen satırın `onboarding_completed_at`'i boşsa sürücü
 * kurulumu bitirmiş olmasına rağmen kurulum ekranına atılıyor ve bir araç
 * daha ekliyor. Gerçek bir cihazda üç ayar satırı ve üç araç böyle oluştu.
 *
 * Buradaki birleştirme SAF: satırları alır, hangisinin kalacağını ve
 * kalanın alanlarının ne olacağını söyler. Veritabanı bilmez, test edilir.
 */

/** Birleştirmenin ihtiyaç duyduğu alanlar. */
export interface MergeableSettings {
  id: string;
  createdAt: number;
  updatedAt: number;
  dayCutoffHour: number;
  defaultVehicleId: string | null;
  defaultEarningSourceId: string | null;
  regionCode: string;
  onboardingCompletedAt: number | null;
  displayName: string | null;
  city: string | null;
  avatar: string | null;
}

export interface SettingsMerge<T> {
  /** Yaşamaya devam edecek satır. */
  survivor: T;
  /** Yumuşak silinecek satırların kimlikleri. */
  removeIds: string[];
  /** Hayatta kalana yazılacak alanlar. Boşsa yazmaya gerek yok. */
  patch: Partial<MergeableSettings>;
}

/**
 * Çoğalmış ayar satırlarını tek satıra indirir.
 *
 * HAYATTA KALAN EN ESKİSİ. En yeniyi seçseydik her yeni cihaz kurulumu
 * kanonik satırı değiştirir ve bulutta sürekli yeni bir kimlik dolaşırdı;
 * en eski satır tüm cihazlarda aynı ve kararlı.
 *
 * Alan değerleri EN SON GÜNCELLENEN satırdan geliyor — kullanıcının en
 * taze tercihi o. Ama boş değer taze sayılmıyor: kesme saatini dün
 * değiştirmiş bir sürücü, bugün açılan boş bir satır yüzünden 04:00'e
 * dönmemeli.
 *
 * `onboardingCompletedAt` İSTİSNA: satırlardan HERHANGİ BİRİ kurulumun
 * bittiğini söylüyorsa kurulum bitmiştir. En erken damga korunuyor, çünkü
 * kurulum gerçekten o gün bitti. Tersini yapıp boşa düşseydik hatanın
 * kendisini yeniden üretirdik.
 */
export function mergeSettingsRows<T extends MergeableSettings>(
  rows: readonly T[],
): SettingsMerge<T> | null {
  if (rows.length <= 1) return null;

  const byAge = [...rows].sort((a, b) => a.createdAt - b.createdAt);
  const survivor = byAge[0];
  const removeIds = byAge.slice(1).map((r) => r.id);

  // En son güncellenen önce: alan değerleri buradan taranıyor.
  const byFreshness = [...rows].sort((a, b) => b.updatedAt - a.updatedAt);

  const firstNonNull = (key: keyof MergeableSettings) => {
    for (const row of byFreshness) {
      const value = row[key];
      if (value != null && value !== '') return value;
    }
    return undefined;
  };

  const patch: Partial<MergeableSettings> = {};

  const cutoff = firstNonNull('dayCutoffHour') as number | undefined;
  if (cutoff != null && cutoff !== survivor.dayCutoffHour) {
    patch.dayCutoffHour = cutoff;
  }

  const vehicle = firstNonNull('defaultVehicleId') as string | undefined;
  if (vehicle != null && vehicle !== survivor.defaultVehicleId) {
    patch.defaultVehicleId = vehicle;
  }

  const source = firstNonNull('defaultEarningSourceId') as string | undefined;
  if (source != null && source !== survivor.defaultEarningSourceId) {
    patch.defaultEarningSourceId = source;
  }

  const region = firstNonNull('regionCode') as string | undefined;
  if (region != null && region !== survivor.regionCode) {
    patch.regionCode = region;
  }

  // Profil alanları da aynı kural: en taze DOLU değer.
  for (const key of ['displayName', 'city', 'avatar'] as const) {
    const value = firstNonNull(key) as string | undefined;
    if (value != null && value !== survivor[key]) patch[key] = value;
  }

  /**
   * Kurulum damgası: herhangi biri doluysa dolu, ve EN ERKENİ geçerli.
   * Kurulum o gün bitti; sonradan açılan bir satırın damgası onu ileri
   * taşımamalı.
   */
  const stamps = rows
    .map((r) => r.onboardingCompletedAt)
    .filter((v): v is number => v != null);
  if (stamps.length > 0) {
    const earliest = Math.min(...stamps);
    if (survivor.onboardingCompletedAt !== earliest) {
      patch.onboardingCompletedAt = earliest;
    }
  }

  return { survivor, removeIds, patch };
}

/**
 * Çoğalmış "tek olması gereken" kayıtlardan hangilerinin silineceği.
 *
 * Kazanç kaynağı da aynı desenle çoğalıyor: `ensureDefaultEarningSource`
 * yerelde bir satır açıyor, çekme buluttakini indiriyor ve iki "Sefer
 * geliri" oluyor. v1'de kaynak arayüzde görünmediği için zararsız duruyor
 * ama seferler iki farklı kimliğe bağlanıyor; ileride kaynak bazlı rapor
 * gerekirse aynı iş iki kaynağa bölünmüş görünür.
 *
 * EN ESKİSİ kalıyor — ayar satırıyla aynı gerekçe.
 */
export function pickDuplicatesToRemove<T extends { id: string; createdAt: number }>(
  rows: readonly T[],
): { keep: T; removeIds: string[] } | null {
  if (rows.length <= 1) return null;
  const byAge = [...rows].sort((a, b) => a.createdAt - b.createdAt);
  return { keep: byAge[0], removeIds: byAge.slice(1).map((r) => r.id) };
}
