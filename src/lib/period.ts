/**
 * Dönemler — Kayıtlar ve İstatistik'in filtre çubuğu, aylık arşiv.
 *
 * İki ekran AYNI dönemleri AYNI sınırlarla görmeli: "Bu ay" Kayıtlar'da
 * 1 Eylül'den, İstatistik'te son 30 günden başlasaydı sürücü iki ekranda
 * iki farklı ciro görürdü ve hangisine inanacağını bilemezdi.
 *
 * Veritabanı bilmez.
 */

import {
  type BusinessDate, addDays, asBusinessDate, daysBetween, endOfMonth, formatBusinessDate,
  isBusinessDate, minBusinessDate, startOfMonth, startOfWeek, startOfYear,
} from './business-date.ts';

export type PeriodKey = 'week' | 'month' | 'year' | 'all';

export const PERIOD_KEYS: readonly PeriodKey[] = ['week', 'month', 'year', 'all'];

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  week: 'Bu hafta',
  month: 'Bu ay',
  year: 'Bu yıl',
  all: 'Tüm zamanlar',
};

/** Karşılaştırma kartının başlığı — önceki dönem TAMAMIYLA alındığında. */
const PREVIOUS_PERIOD_LABELS: Record<Exclude<PeriodKey, 'all'>, string> = {
  week: 'Geçen hafta',
  month: 'Geçen ay',
  year: 'Geçen yıl',
};

export interface PeriodRange {
  from: BusinessDate;
  to: BusinessDate;
  /** Karşılaştırılacak önceki dönem; "Tüm zamanlar"da yok. */
  previousFrom: BusinessDate | null;
  previousTo: BusinessDate | null;
}

/**
 * Dönemin sınırları ve karşılaştırılacak önceki dönem.
 *
 * Bitiş her zaman BUGÜN: yarısı geçmiş bir ayı tam ay gibi göstermek,
 * sürücüye ayın kötü geçtiğini düşündürür.
 *
 * Önceki dönem AYNI UZUNLUKTA: geçen haftanın/ayın ilk N günü, geçen
 * yılın aynı tarihine kadarı. Eskiden önceki dönem tam alınıyordu;
 * pazartesi akşamı 2.000 ₺'lik bir gün, geçen haftanın 14.000 ₺'lik
 * tamamıyla karşılaştırılıp "%86 daha düşük" yazıyordu — ayın ve yılın
 * başında her sürücü kırmızı bir düşüş görüyordu. Önceki dönem kısaysa
 * (31 günlük ayın 31'i, 30 günlük önceki ay) sonunda durur.
 *
 * "Tüm zamanlar" ilk kayıttan başlar; sabit bir pencere eski günleri
 * sessizce yutardı. Hiç kayıt yoksa bugün — sorgu boş döner.
 */
export function periodBounds(
  period: PeriodKey, today: BusinessDate, oldest: BusinessDate | null,
): PeriodRange {
  if (period === 'week') {
    const from = startOfWeek(today);
    const previousFrom = addDays(from, -7);
    return { from, to: today, previousFrom, previousTo: addDays(today, -7) };
  }
  if (period === 'month') {
    const from = startOfMonth(today);
    const previousEnd = addDays(from, -1);
    const previousFrom = startOfMonth(previousEnd);
    // Ay bittiyse (bugün son günü) iki ayın TAMAMI: 30 Eylül'de Ağustos'un
    // 31'i dışarıda kalmasın.
    const previousTo = today === endOfMonth(today) ? previousEnd
      : minBusinessDate(addDays(previousFrom, daysBetween(from, today)), previousEnd);
    return { from, to: today, previousFrom, previousTo };
  }
  if (period === 'year') {
    const from = startOfYear(today);
    const previousEnd = addDays(from, -1);
    const previousFrom = startOfYear(previousEnd);
    return { from, to: today, previousFrom, previousTo: sameDateLastYear(today) };
  }
  const from = oldest != null && oldest < today ? oldest : today;
  return { from, to: today, previousFrom: null, previousTo: null };
}

/** Geçen yılın aynı günü; 29 Şubat'ın karşılığı 28 Şubat. */
function sameDateLastYear(d: BusinessDate): BusinessDate {
  const [y, m, day] = d.split('-').map(Number);
  const lastYear = asBusinessDate(`${y - 1}-${String(m).padStart(2, '0')}-01`);
  const lastDay = Number(endOfMonth(lastYear).slice(8));
  return addDays(lastYear, Math.min(day, lastDay) - 1);
}

/**
 * Karşılaştırma notunun başlığı: önceki dönemin NE KADARINA bakıldığı.
 *
 * "Geçen ay: 14.000 ₺" yazıp ayın ilk 10 gününü göstermek sürücüyü
 * yanıltır; kısmi karşılaştırma adıyla söyleniyor. Önceki dönem tam
 * alındıysa (pazar günü haftaya, ayın son günü aya bakılıyorsa) kısa ad.
 */
export function previousPeriodLabel(period: PeriodKey, range: PeriodRange): string | null {
  if (period === 'all' || !range.previousFrom || !range.previousTo) return null;
  const full = period === 'week' ? addDays(range.previousFrom, 6)
    : period === 'month' ? endOfMonth(range.previousFrom)
    : addDays(range.from, -1);
  if (range.previousTo >= full) return PREVIOUS_PERIOD_LABELS[period];
  if (period === 'week') return 'Geçen hafta aynı günler';
  if (period === 'month') {
    return `Geçen ayın ilk ${daysBetween(range.previousFrom, range.previousTo) + 1} günü`;
  }
  return 'Geçen yıl aynı dönem';
}

// ---------------------------------------------------------------------------
// Aylık arşiv
// ---------------------------------------------------------------------------

/** 'YYYY-MM' — arşivde bir ayın anahtarı ve adresteki parametresi. */
export type MonthKey = string & { readonly __month: true };

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonthKey(value: unknown): value is MonthKey {
  return typeof value === 'string' && MONTH_KEY.test(value);
}

export function monthKeyOf(d: BusinessDate): MonthKey {
  return d.slice(0, 7) as MonthKey;
}

/** Ayın ilk ve son günü. Bozuk anahtarda `null` — adresten geliyor. */
export function monthRange(key: string): { from: BusinessDate; to: BusinessDate } | null {
  if (!isMonthKey(key)) return null;
  const first = `${key}-01`;
  if (!isBusinessDate(first)) return null;
  const from = asBusinessDate(first);
  return { from, to: endOfMonth(from) };
}

/** "Haziran 2026". */
export function formatMonthKey(key: MonthKey): string {
  return formatBusinessDate(asBusinessDate(`${key}-01`), 'monthYear');
}

/**
 * `from` ile `to` arasındaki aylar, EN YENİ ÖNCE, iki uç dahil.
 * `from` `to`'dan sonraysa boş.
 */
export function monthsBetween(from: BusinessDate, to: BusinessDate): MonthKey[] {
  const first = monthKeyOf(from);
  const out: MonthKey[] = [];
  let cursor = startOfMonth(to);
  while (monthKeyOf(cursor) >= first) {
    out.push(monthKeyOf(cursor));
    cursor = startOfMonth(addDays(cursor, -1));
  }
  return out;
}
