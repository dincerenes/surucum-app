/**
 * İstatistik kartlarının aritmetiği — zaman, yolcu, km, sıcak saatler,
 * gider dağılımı, kazanç seyri.
 *
 * Veritabanı bilmez: gün özetlerini ve ham satırları alır. Okuma
 * `src/db/repo/insights.ts` içinde.
 *
 * ORTAK KURAL: bir oranın paydası BİLİNMİYORSA o oran yok (`null`), sıfır
 * değil. Km'si girilmemiş günü km analizine, açık vardiyalı günü saat
 * analizine katmak oranı sessizce bozuyordu.
 */

import {
  type BusinessDate, addDays, businessDatesInRange, daysBetween,
} from './business-date.ts';
import { type Kurus, ZERO, add, sum } from './money.ts';
import { earningsPerHour, earningsPerKm, earningsPerRide } from './shift.ts';
import { type DayEntry, calculatePeriodTotals, totalsByMonth } from './stats.ts';

// ---------------------------------------------------------------------------
// Zaman verimliliği
// ---------------------------------------------------------------------------

export interface TimeStats {
  /** Hesaba giren gün — çalışılmış ve açık vardiyası olmayan. */
  dayCount: number;
  totalMinutes: number;
  closedShiftCount: number;
  /** Saat başına cebe kalan. */
  perHour: Kurus | null;
  /** Kapanmış vardiya başına ortalama süre. */
  minutesPerShift: number | null;
  /** Saatte kaç yolcu. */
  ridesPerHour: number | null;
  /** Bir yolcuya düşen ortalama süre, dakika. */
  minutesPerRide: number | null;
}

/**
 * Açık vardiyalı gün DIŞARIDA: o günün yolcuları sayılıyor ama süresi
 * yok (vardiya bitince soruluyor). Katılsa saatte yolcu ve saat başına
 * kazanç şişerdi.
 */
export function timeStats(days: readonly DayEntry[]): TimeStats {
  const closed = days.filter((d) => d.summary.isWorkedDay
    && d.summary.completeness.openShiftCount === 0
    && d.summary.durationMinutes > 0);

  const totalMinutes = closed.reduce((a, d) => a + d.summary.durationMinutes, 0);
  const rides = closed.reduce((a, d) => a + d.summary.rideCount, 0);
  const shifts = closed.reduce((a, d) => a + d.summary.completeness.closedShiftCount, 0);
  const cash = sum(closed.map((d) => d.summary.profit.cashProfit));
  const hours = totalMinutes / 60;

  return {
    dayCount: closed.length,
    totalMinutes,
    closedShiftCount: shifts,
    perHour: earningsPerHour(cash, totalMinutes),
    minutesPerShift: shifts > 0 ? Math.round(totalMinutes / shifts) : null,
    ridesPerHour: hours > 0 ? rides / hours : null,
    minutesPerRide: rides > 0 ? Math.round(totalMinutes / rides) : null,
  };
}

// ---------------------------------------------------------------------------
// Yolcu analizi
// ---------------------------------------------------------------------------

export interface RideStats {
  rideCount: number;
  workedDayCount: number;
  ridesPerDay: number | null;
  /** Yolcu başına ciro. */
  revenuePerRide: Kurus | null;
  /** Yolcu başına cebe kalan. */
  cashPerRide: Kurus | null;
  /** En çok yolcu taşınan gün. Yolcu yoksa `null`. */
  busiestDay: { date: BusinessDate; rideCount: number } | null;
}

export function rideStats(days: readonly DayEntry[]): RideStats {
  const t = calculatePeriodTotals(days);
  let busiest: RideStats['busiestDay'] = null;
  for (const d of days) {
    const n = d.summary.rideCount;
    if (n > 0 && (busiest == null || n > busiest.rideCount
      || (n === busiest.rideCount && d.date > busiest.date))) {
      busiest = { date: d.date, rideCount: n };
    }
  }
  return {
    rideCount: t.rideCount,
    workedDayCount: t.workedDayCount,
    ridesPerDay: t.workedDayCount > 0 ? t.rideCount / t.workedDayCount : null,
    revenuePerRide: earningsPerRide(t.revenue, t.rideCount),
    cashPerRide: earningsPerRide(t.cashProfit, t.rideCount),
    busiestDay: busiest,
  };
}

// ---------------------------------------------------------------------------
// Km analizi
// ---------------------------------------------------------------------------

export interface KmStats {
  /** Km'si TAM bilinen çalışılmış gün — bütün oranların tabanı. */
  dayCount: number;
  /** Km'si eksik olduğu için dışarıda kalan çalışılmış gün. */
  skippedDayCount: number;
  totalKm: number | null;
  kmPerDay: number | null;
  revenuePerKm: Kurus | null;
  cashPerKm: Kurus | null;
  /** Km başına yakıt + yıpranma. */
  costPerKm: Kurus | null;
  kmPerRide: number | null;
}

/**
 * Yalnızca km'si TAM girilmiş günler: iki vardiyanın birinde km boşsa
 * o günün cirosu iki vardiyanın, km'si birinin olur ve km başına ciro
 * şişer. Böyle gün sayılıp ayrıca söyleniyor.
 */
export function kmStats(days: readonly DayEntry[]): KmStats {
  const worked = days.filter((d) => d.summary.isWorkedDay);
  const known = worked.filter((d) => d.summary.completeness.distance === 'complete'
    && d.summary.completeness.openShiftCount === 0
    && d.summary.distanceKm != null && d.summary.distanceKm > 0);

  const km = known.reduce((a, d) => a + d.summary.distanceKm!, 0);
  const rides = known.reduce((a, d) => a + d.summary.rideCount, 0);
  const revenue = sum(known.map((d) => d.summary.profit.revenue));
  const cash = sum(known.map((d) => d.summary.profit.cashProfit));
  const cost = sum(known.map((d) => add(d.summary.profit.fuelPaid, d.summary.profit.wearShare)));
  const has = known.length > 0 && km > 0;

  return {
    dayCount: known.length,
    skippedDayCount: worked.length - known.length,
    totalKm: has ? km : null,
    kmPerDay: has ? Math.round(km / known.length) : null,
    revenuePerKm: has ? earningsPerKm(revenue, km) : null,
    cashPerKm: has ? earningsPerKm(cash, km) : null,
    costPerKm: has ? earningsPerKm(cost, km) : null,
    kmPerRide: has && rides > 0 ? km / rides : null,
  };
}

// ---------------------------------------------------------------------------
// Sıcak saatler
// ---------------------------------------------------------------------------

/** "En yoğun saatlerin" penceresinin genişliği. */
export const HOT_WINDOW_HOURS = 3;

export interface RideTime {
  /** Yolcunun girildiği an. */
  occurredAt: number;
  /** Brüt + bahşiş. */
  revenueKurus: Kurus;
}

export interface HourBucket {
  /** 0–23, cihazın yerel saati. */
  hour: number;
  rideCount: number;
  revenue: Kurus;
  /** En yoğun saate göre 0–1. */
  ratio: number;
}

/**
 * Günün 24 saatine göre yolcu ve ciro.
 *
 * Saat cihazın YEREL saati: sürücü "akşam 6'da yoğun" diye düşünüyor,
 * UTC değil. İş günü kesim saati burada yok — gece 2'deki yolcu dün
 * gecenin iş gününe ait olsa da saat 02.
 */
export function hourlyBuckets(rides: readonly RideTime[]): HourBucket[] {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    hour, rideCount: 0, revenue: ZERO, ratio: 0,
  }));
  for (const r of rides) {
    const b = buckets[new Date(r.occurredAt).getHours()];
    b.rideCount += 1;
    b.revenue = add(b.revenue, r.revenueKurus);
  }
  const most = buckets.reduce((a, b) => Math.max(a, b.rideCount), 0);
  for (const b of buckets) b.ratio = most > 0 ? b.rideCount / most : 0;
  return buckets;
}

export interface HotWindow {
  /** Pencerenin ilk saati. */
  startHour: number;
  /** Pencereden sonraki saat — 17 başlayan 3 saatlik pencerede 20. */
  endHour: number;
  rideCount: number;
  /** Yolcuların yüzde kaçı bu pencerede. */
  share: number;
}

/**
 * En yoğun ardışık `HOT_WINDOW_HOURS` saat. Gece yarısını aşabilir
 * (23–02). Eşitlikte en erken başlayan.
 */
export function hotWindow(buckets: readonly HourBucket[]): HotWindow | null {
  const total = buckets.reduce((a, b) => a + b.rideCount, 0);
  if (total === 0) return null;

  let best = { start: 0, count: -1 };
  for (let start = 0; start < 24; start += 1) {
    let count = 0;
    for (let i = 0; i < HOT_WINDOW_HOURS; i += 1) count += buckets[(start + i) % 24].rideCount;
    if (count > best.count) best = { start, count };
  }
  return {
    startHour: best.start,
    endHour: (best.start + HOT_WINDOW_HOURS) % 24,
    rideCount: best.count,
    share: best.count / total,
  };
}

// ---------------------------------------------------------------------------
// Gider dağılımı
// ---------------------------------------------------------------------------

export interface CostSlice {
  key: string;
  label: string;
  amount: Kurus;
  /** Toplam gidere göre 0–1. */
  share: number;
}

export interface CategoryAmount {
  categoryId: string;
  name: string;
  amount: Kurus;
}

/**
 * Cirodan düşen her şey: komisyon, yakıt, gider kategorileri, yıpranma.
 *
 * Kategorilerin toplamı gün özetlerindeki `expensesPaid` ile aynı
 * satırlardan geliyor; sabit gider payı v1'de sıfır, sıfırsa dilim yok.
 * Büyükten küçüğe sıralı; sıfır dilim listede yok.
 */
export function costBreakdown(
  days: readonly DayEntry[], categories: readonly CategoryAmount[],
): { total: Kurus; slices: CostSlice[] } {
  const t = calculatePeriodTotals(days);
  const fixed = sum(days.map((d) => d.summary.profit.fixedShare ?? ZERO));
  const raw: Omit<CostSlice, 'share'>[] = [
    { key: 'commission', label: 'Komisyon', amount: t.commission },
    { key: 'fuel', label: 'Yakıt', amount: t.fuelPaid },
    ...categories.map((c) => ({ key: `cat:${c.categoryId}`, label: c.name, amount: c.amount })),
    { key: 'wear', label: 'Yıpranma payı', amount: t.wearShare },
    { key: 'fixed', label: 'Sabit gider payı', amount: fixed },
  ];
  const positive = raw.filter((s) => s.amount > 0);
  const total = sum(positive.map((s) => s.amount));
  return {
    total,
    slices: positive
      .map((s) => ({ ...s, share: total > 0 ? s.amount / total : 0 }))
      .sort((a, b) => b.amount - a.amount),
  };
}

// ---------------------------------------------------------------------------
// Kazanç seyri
// ---------------------------------------------------------------------------

/** Günlük çubuk gösterilecek en uzun aralık; üstü aylık. */
export const MAX_DAILY_BARS = 31;

export interface TrendBar {
  /** Gün ('2026-09-23') ya da ay ('2026-09'). */
  key: string;
  /** Cebe kalan. Kaydı olmayan günde/ayda `null`. */
  cashProfit: Kurus | null;
}

/**
 * Dönemin kazanç seyri. 31 güne kadar gün gün, daha uzunsa ay ay.
 *
 * Kaydı olmayan gün boş çubuk: çalışılmayan günü grafikten atmak dönemi
 * olduğundan dolu gösterir.
 */
export function trendBars(
  days: readonly DayEntry[], from: BusinessDate, to: BusinessDate,
): { unit: 'day' | 'month'; bars: TrendBar[] } {
  if (daysBetween(from, to) + 1 <= MAX_DAILY_BARS) {
    const dates = businessDatesInRange(from, to);
    const byDate = new Map(days.map((d) => [d.date, d.summary]));
    return {
      unit: 'day',
      bars: dates.map((date) => {
        const s = byDate.get(date);
        return { key: date, cashProfit: s?.hasActivity ? s.profit.cashProfit : null };
      }),
    };
  }

  const months = totalsByMonth(days);
  const keys: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const key = d.slice(0, 7);
    if (keys[keys.length - 1] !== key) keys.push(key);
  }
  return {
    unit: 'month',
    bars: keys.map((key) => {
      const t = months.get(key);
      return { key, cashProfit: t && t.dayCount > 0 ? t.cashProfit : null };
    }),
  };
}

/** Çubuk yüksekliği 0–1, en iyi çubuğa göre. Zarar ve boş 0. */
export function trendRatio(value: Kurus | null, bars: readonly TrendBar[]): number {
  const best = bars.reduce((a, b) => Math.max(a, b.cashProfit ?? 0), 0);
  if (value == null || value <= 0 || best <= 0) return 0;
  return value / best;
}
