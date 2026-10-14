/**
 * İŞ GÜNÜ — takvim gününden farklıdır.
 *
 * Gece 22:00'de başlayıp sabah 06:00'da biten bir vardiya iki takvim gününe
 * yayılır ama sürücünün kafasında tek bir "çalışma günü"dür. Bu yüzden her
 * kayıt, takvim zaman damgasının yanında bir de `business_date` taşır.
 *
 * Gün kesme saati (varsayılan 04:00) kullanıcı ayarıdır: bu saatten önceki
 * her şey bir önceki iş gününe yazılır.
 *
 * Biçim: 'YYYY-MM-DD'. Saat ve saat dilimi içermez — sıralanabilir,
 * karşılaştırılabilir ve saat dilimi belirsizliği taşımaz.
 */

declare const BUSINESS_DATE_BRAND: unique symbol;

export type BusinessDate = string & { readonly [BUSINESS_DATE_BRAND]: true };

/**
 * Gün kesme saati — artık AYAR DEĞİL, gece yarısı.
 *
 * Eskiden kullanıcı ayarıydı (varsayılan 04:00): gece yarısından sonra
 * girilen kayıt bir önceki güne yazılıyordu. Ama günü bölen şey saat
 * değil VARDİYA: vardiyaya bağlı her kayıt vardiyanın gününü alıyor
 * (başladığı takvim günü), 22:00'de açılıp 04:00'te kapanan vardiya
 * baştan sona tek bir gün. Kesme saati yalnızca vardiya dışı kayıtları
 * etkiliyordu ve sürücüye anlamını açıklamak mümkün olmadı.
 *
 * Fonksiyonların saat parametresi duruyor: geçmiş kayıtlar eski kesme
 * saatiyle yazıldı ve testler o kuralı hâlâ koruyor.
 */
export const DEFAULT_CUTOFF_HOUR = 0;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTHS_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
] as const;

/** Pazartesi'den başlar — Türkiye'de haftanın ilk günü Pazartesi'dir. */
const WEEKDAYS_TR = [
  'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar',
] as const;

/**
 * Kısa gün adları, aynı sırayla. Dar yerler için (gün seçici, hafta
 * çubukları): üç harf, her gün BENZERSİZ — "Ç" ile "C" ayrı tutulduğu
 * için Çarşamba ile Cuma, Cumartesi ile Cuma karışmıyor.
 */
export const WEEKDAYS_SHORT_TR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;

// ---------------------------------------------------------------------------
// Oluşturma ve doğrulama
// ---------------------------------------------------------------------------

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function ymd(year: number, month1: number, day: number): BusinessDate {
  return `${year}-${pad2(month1)}-${pad2(day)}` as BusinessDate;
}

export function isBusinessDate(value: unknown): value is BusinessDate {
  if (typeof value !== 'string') return false;
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  // Ayın gerçekten o kadar günü var mı? (31 Şubat'ı ele)
  const probe = new Date(year, month - 1, day);
  return probe.getFullYear() === year
    && probe.getMonth() === month - 1
    && probe.getDate() === day;
}

export function asBusinessDate(value: string): BusinessDate {
  if (!isBusinessDate(value)) {
    throw new TypeError(`Geçersiz iş günü: ${value}`);
  }
  return value;
}

function parts(d: BusinessDate): { year: number; month1: number; day: number } {
  const m = ISO_DATE.exec(d);
  if (!m) throw new TypeError(`Geçersiz iş günü: ${d}`);
  return { year: Number(m[1]), month1: Number(m[2]), day: Number(m[3]) };
}

// ---------------------------------------------------------------------------
// Zaman damgası ↔ iş günü
// ---------------------------------------------------------------------------

/**
 * Bir zaman damgasının hangi iş gününe ait olduğunu bulur.
 *
 * Kesme saati 04:00 iken:
 *   25 Ağustos 02:30 → 2026-08-24  (henüz dünün vardiyası)
 *   25 Ağustos 05:00 → 2026-08-25
 *
 * Milisaniye çıkarmak yerine yerel saati okuyup takvim gününü geri alıyoruz;
 * böylece yaz saati geçişlerinde bir saatlik kayma oluşmuyor.
 */
export function toBusinessDate(
  at: Date | number,
  cutoffHour: number = DEFAULT_CUTOFF_HOUR,
): BusinessDate {
  const d = typeof at === 'number' ? new Date(at) : at;
  if (Number.isNaN(d.getTime())) {
    throw new TypeError('Geçersiz tarih');
  }
  if (d.getHours() >= cutoffHour) {
    return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  const prev = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  return ymd(prev.getFullYear(), prev.getMonth() + 1, prev.getDate());
}

export function todayBusinessDate(
  cutoffHour: number = DEFAULT_CUTOFF_HOUR,
  now: Date = new Date(),
): BusinessDate {
  return toBusinessDate(now, cutoffHour);
}

/**
 * Bir iş gününün gerçek zaman aralığı: [start, end)
 * Sorgularda bu aralık kullanılır — `business_date = ?` yeterli olmadığında,
 * örneğin ham zaman damgasıyla filtreleme gerektiğinde.
 */
export function businessDateBounds(
  d: BusinessDate,
  cutoffHour: number = DEFAULT_CUTOFF_HOUR,
): { startMs: number; endMs: number } {
  const { year, month1, day } = parts(d);
  const startMs = new Date(year, month1 - 1, day, cutoffHour, 0, 0, 0).getTime();
  const endMs = new Date(year, month1 - 1, day + 1, cutoffHour, 0, 0, 0).getTime();
  return { startMs, endMs };
}

/**
 * İş gününün bir sonraki değişeceği an (ms) — yani şimdiki iş gününün sonu.
 *
 * Ekranlar "bugün"ü yalnızca kayıt yazılınca yeniden okuyordu; sürücü
 * uygulamayı gece açık bırakınca 1 Kasım sabahı hâlâ "31 EKİM" görüyordu.
 * Zamanlayıcı bu ana kurulur: saniyede bir bakmaya gerek yok.
 *
 * Kesme saati 04:00 iken 25 Ağustos 02:30 → 25 Ağustos 04:00,
 * 25 Ağustos 05:00 → 26 Ağustos 04:00.
 */
export function nextBusinessDateChange(
  at: Date | number,
  cutoffHour: number = DEFAULT_CUTOFF_HOUR,
): number {
  return businessDateBounds(toBusinessDate(at, cutoffHour), cutoffHour).endMs;
}

// ---------------------------------------------------------------------------
// Aritmetik
// ---------------------------------------------------------------------------

export function addDays(d: BusinessDate, days: number): BusinessDate {
  const { year, month1, day } = parts(d);
  const next = new Date(year, month1 - 1, day + days);
  return ymd(next.getFullYear(), next.getMonth() + 1, next.getDate());
}

/** b − a, gün cinsinden. Saat dilimi etkisinden bağımsız. */
export function daysBetween(a: BusinessDate, b: BusinessDate): number {
  const pa = parts(a);
  const pb = parts(b);
  const ua = Date.UTC(pa.year, pa.month1 - 1, pa.day);
  const ub = Date.UTC(pb.year, pb.month1 - 1, pb.day);
  return Math.round((ub - ua) / 86_400_000);
}

export function compareBusinessDate(a: BusinessDate, b: BusinessDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minBusinessDate(a: BusinessDate, b: BusinessDate): BusinessDate {
  return a <= b ? a : b;
}

export function maxBusinessDate(a: BusinessDate, b: BusinessDate): BusinessDate {
  return a >= b ? a : b;
}

/** [from, to] aralığındaki tüm iş günleri, iki uç dahil. */
export function businessDatesInRange(
  from: BusinessDate,
  to: BusinessDate,
): BusinessDate[] {
  const span = daysBetween(from, to);
  if (span < 0) return [];
  const out: BusinessDate[] = new Array(span + 1);
  for (let i = 0; i <= span; i++) out[i] = addDays(from, i);
  return out;
}

// ---------------------------------------------------------------------------
// Dönem sınırları — raporlar ve dönemsel gider dağıtımı için
// ---------------------------------------------------------------------------

export function startOfMonth(d: BusinessDate): BusinessDate {
  const { year, month1 } = parts(d);
  return ymd(year, month1, 1);
}

export function endOfMonth(d: BusinessDate): BusinessDate {
  const { year, month1 } = parts(d);
  const last = new Date(year, month1, 0); // ayın 0'ıncı günü = önceki ayın sonu
  return ymd(last.getFullYear(), last.getMonth() + 1, last.getDate());
}

export function daysInMonth(d: BusinessDate): number {
  const { year, month1 } = parts(d);
  return new Date(year, month1, 0).getDate();
}

/** Haftanın başlangıcı Pazartesi. */
export function startOfWeek(d: BusinessDate): BusinessDate {
  const { year, month1, day } = parts(d);
  const probe = new Date(year, month1 - 1, day);
  const jsDay = probe.getDay(); // 0 = Pazar
  const offset = jsDay === 0 ? 6 : jsDay - 1;
  return addDays(d, -offset);
}

export function endOfWeek(d: BusinessDate): BusinessDate {
  return addDays(startOfWeek(d), 6);
}

export function startOfYear(d: BusinessDate): BusinessDate {
  return ymd(parts(d).year, 1, 1);
}

/** 0 = Pazartesi … 6 = Pazar. Kârlılık ısı haritasının eksenidir. */
export function weekdayIndex(d: BusinessDate): number {
  const { year, month1, day } = parts(d);
  const jsDay = new Date(year, month1 - 1, day).getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

// ---------------------------------------------------------------------------
// Biçimlendirme
// ---------------------------------------------------------------------------

export type DateStyle = 'short' | 'long' | 'dayMonth' | 'monthYear' | 'weekday';

/**
 *   short     → 25.08.2026
 *   long      → 25 Ağustos 2026
 *   dayMonth  → 25 Ağustos
 *   monthYear → Ağustos 2026
 *   weekday   → Salı, 25 Ağustos
 */
export function formatBusinessDate(d: BusinessDate, style: DateStyle = 'short'): string {
  const { year, month1, day } = parts(d);
  const monthName = MONTHS_TR[month1 - 1];
  switch (style) {
    case 'short':
      return `${pad2(day)}.${pad2(month1)}.${year}`;
    case 'long':
      return `${day} ${monthName} ${year}`;
    case 'dayMonth':
      return `${day} ${monthName}`;
    case 'monthYear':
      return `${monthName} ${year}`;
    case 'weekday':
      return `${WEEKDAYS_TR[weekdayIndex(d)]}, ${day} ${monthName}`;
  }
}

export function weekdayName(d: BusinessDate): string {
  return WEEKDAYS_TR[weekdayIndex(d)];
}

export function monthName(month1: number): string {
  return MONTHS_TR[month1 - 1];
}

/** "Bugün" / "Dün" / "3 gün önce" — gün sonu kartı başlıkları için. */
export function formatRelative(
  d: BusinessDate,
  reference: BusinessDate = todayBusinessDate(),
): string {
  const diff = daysBetween(d, reference);
  if (diff === 0) return 'Bugün';
  if (diff === 1) return 'Dün';
  if (diff === -1) return 'Yarın';
  if (diff > 1 && diff < 7) return `${diff} gün önce`;
  return formatBusinessDate(d, 'dayMonth');
}

export { MONTHS_TR, WEEKDAYS_TR };

/**
 * Damgadan saat:dakika.
 *
 * `toLocaleTimeString` KULLANILMIYOR: Hermes'te ICU verisi eksik olabiliyor
 * ve saat biçimi cihaza göre değişiyor. İki haneli 24 saat her cihazda
 * aynı görünsün — sürücü kaydını saatinden tanıyor.
 */
export function formatClock(at: number): string {
  const d = new Date(at);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
