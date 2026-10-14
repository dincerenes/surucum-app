/**
 * İstatistik aritmetiği.
 *
 * Veritabanı bilmez: gün özetlerini alır, dönem sayıları üretir. Okuma
 * `src/db/repo/summary.ts` içinde; burada yalnızca hesap var ki native
 * SQLite kurmadan test edilebilsin.
 *
 * KULLANILAN TERİMLER SABİT: Ciro, Cebe kalan, Gerçek kâr. "Net kazanç"
 * gibi dördüncü bir terim üretilmiyor — tanımsız bir sayı, sürücünün
 * hangi rakama baktığını bilmemesi demek.
 */

import { type Kurus, ZERO, add, sum } from './money.ts';
import { type BusinessDate, weekdayIndex } from './business-date.ts';
import type { DaySummary } from './day-summary.ts';
import {
  earningsPerDay, earningsPerHour, earningsPerKm, earningsPerRide,
} from './shift.ts';

export interface DayEntry {
  date: BusinessDate;
  summary: DaySummary;
}

export interface PeriodTotals {
  /** Kaydı olan gün sayısı — dönem boş mu, onu söyler. */
  dayCount: number;

  /**
   * ÇALIŞILAN gün sayısı — sefer ya da kapanmış vardiya olan gün. Gün
   * başına ortalamanın paydası bu. Yalnızca gider ya da depo alımı olan
   * gün çalışılmış sayılmaz: sürücünün Pazar günü yaptığı dolum o günü
   * "−1.000 ₺ kazandığı gün" yapıp ortalamayı yarıya indiriyordu.
   * Maliyeti yine dönem toplamında kalıyor.
   */
  workedDayCount: number;

  /** Dönemdeki vardiya sayısı — açık vardiya dahil. */
  shiftCount: number;

  revenue: Kurus;
  cashProfit: Kurus;
  trueProfit: Kurus;

  commission: Kurus;
  fuelPaid: Kurus;
  expensesPaid: Kurus;
  wearShare: Kurus;

  rideCount: number;
  /** Bilinen kilometrelerin toplamı. Hiç girilmemişse `null`. */
  distanceKm: number | null;
  /**
   * Kilometresi bilinen gün sayısı — gün başına km ortalamasının paydası.
   * Km'si girilmemiş günü paydaya katmak ortalamayı sessizce düşürürdü.
   */
  distanceDayCount: number;
  durationMinutes: number;

  /** Türetilmiş oranlar — paydası CEBE KALAN. Payda yoksa `null`. */
  perHour: Kurus | null;
  perKm: Kurus | null;
  perRide: Kurus | null;
  /** Çalışılan gün başına cebe kalan. */
  perDay: Kurus | null;
  /** Çalışılan gün başına ciro. */
  revenuePerDay: Kurus | null;

  /**
   * Eksiklikler — günlerinkinin toplamı, tutardan bağımsız. Yalnızca
   * KAPANMIŞ vardiyalar sayılıyor: açık vardiyanın kilometresi henüz
   * sorulmadı, yalnız gider içeren günde de sorulacak bir şey yok.
   * Eskiden yalnızca "km'si hiç bilinmeyen gün" sayılıyordu: iki
   * vardiyanın birinde km eksik olan gün dönemde kayboluyor, yalnız
   * gider içeren gün ise km eksik sayılıyordu.
   */
  shiftsMissingDistance: number;
  shiftsMissingFuel: number;
  shiftsMissingCommission: number;
  /** Tüketimden hesaplandığı için ayrıca düşülmeyen dolumlar. */
  fillsNotCountedKurus: Kurus;
  /** O gün o araçla vardiya olmadığı için hesaba girmeyen depo alımları. */
  offDayFillsKurus: Kurus;
}

/**
 * Dönemin toplamları.
 *
 * Günlerin ÖZETLERİ toplanıyor, ham satırlar yeniden hesaplanmıyor:
 * yıpranma payı ve yakıt maliyeti vardiya bazında, her aracın kendi
 * oranıyla hesaplanmış durumda. Dönem geneline tek oran uygulamak
 * ortalama almak olurdu ve ortalama kuruş kaybettirir.
 */
export function calculatePeriodTotals(days: readonly DayEntry[]): PeriodTotals {
  const revenue = sum(days.map((d) => d.summary.profit.revenue));
  const cashProfit = sum(days.map((d) => d.summary.profit.cashProfit));
  const trueProfit = sum(days.map((d) => d.summary.profit.trueProfit));

  const rideCount = days.reduce((acc, d) => acc + d.summary.rideCount, 0);
  const durationMinutes = days.reduce((acc, d) => acc + d.summary.durationMinutes, 0);

  /**
   * Kilometre HİÇ girilmemişse `null` kalıyor, sıfır değil. Sıfır
   * kilometre "hiç yol yapmadı" demektir; bilinmeyen ise ₺/km'nin
   * gösterilmemesi gereken hâlidir.
   */
  const knownDistances = days
    .map((d) => d.summary.distanceKm)
    .filter((km): km is number => km != null);
  const distanceKm = knownDistances.length > 0
    ? knownDistances.reduce((a, b) => a + b, 0)
    : null;

  const dayCount = days.length;
  const workedDayCount = days.filter((d) => d.summary.isWorkedDay).length;
  const count = (pick: (d: DayEntry) => number) => days.reduce((acc, d) => acc + pick(d), 0);

  return {
    dayCount,
    workedDayCount,
    shiftCount: count((d) => d.summary.completeness.closedShiftCount
      + d.summary.completeness.openShiftCount),
    revenue,
    cashProfit,
    trueProfit,
    commission: sum(days.map((d) => d.summary.profit.commission)),
    fuelPaid: sum(days.map((d) => d.summary.profit.fuelPaid)),
    expensesPaid: sum(days.map((d) => d.summary.profit.expensesPaid)),
    wearShare: sum(days.map((d) => d.summary.profit.wearShare)),
    rideCount,
    distanceKm,
    distanceDayCount: knownDistances.length,
    durationMinutes,
    perHour: earningsPerHour(cashProfit, durationMinutes),
    perKm: earningsPerKm(cashProfit, distanceKm),
    perRide: earningsPerRide(cashProfit, rideCount),
    perDay: earningsPerDay(cashProfit, workedDayCount),
    revenuePerDay: earningsPerDay(revenue, workedDayCount),
    shiftsMissingDistance: count((d) => d.summary.completeness.shiftsMissingDistance),
    shiftsMissingFuel: count((d) => d.summary.completeness.shiftsMissingFuel),
    shiftsMissingCommission: count((d) => d.summary.completeness.shiftsMissingCommission),
    fillsNotCountedKurus: sum(days.map((d) => d.summary.completeness.fillsNotCountedKurus)),
    offDayFillsKurus: sum(days.map((d) => d.summary.completeness.offDayFillsKurus)),
  };
}

/**
 * Günleri aylara böler ve her ayın toplamını çıkarır — aylık arşivin
 * listesi. Anahtar 'YYYY-MM'. Kaydı olmayan ay haritada yok.
 */
export function totalsByMonth(days: readonly DayEntry[]): Map<string, PeriodTotals> {
  const groups = new Map<string, DayEntry[]>();
  for (const d of days) {
    const key = d.date.slice(0, 7);
    const list = groups.get(key);
    if (list) list.push(d);
    else groups.set(key, [d]);
  }
  return new Map([...groups].map(([key, list]) => [key, calculatePeriodTotals(list)]));
}

export interface WeekdayStat {
  /** 0 = Pazartesi … 6 = Pazar. */
  index: number;
  dayCount: number;
  cashProfit: Kurus;
  /** Gün başına ortalama cebe kalan. Kayıt yoksa `null`. */
  average: Kurus | null;
  /**
   * En iyi güne göre oran, 0–1. Isı şeridinin tonu bundan geliyor.
   * Hiç kazanılmamışsa 0.
   */
  ratio: number;
}

/**
 * Haftanın günlerine göre kazanç.
 *
 * ORTALAMA karşılaştırılıyor, TOPLAM değil. Sürücü altı Cumartesi, üç
 * Salı çalıştıysa toplam Cumartesi'yi otomatik öne çıkarır ve "Cumartesi
 * daha kazançlı" der — oysa tek bildiğimiz daha çok çalıştığı.
 *
 * ORAN NEGATİFİ KIRPMIYOR ama şeride sıfır olarak giriyor: zararlı bir
 * günü "az kazançlı" tonlamak, zararı bir tonun içinde saklamak olurdu.
 * Zarar rakamın kendisinde kırmızı duruyor.
 *
 * Yalnızca ÇALIŞILAN günler (`isWorkedDay`): Pazar yapılan bir depo alımı
 * Pazar'ı "ortalama −1.000 ₺" gösteriyordu.
 */
export function summarizeByWeekday(days: readonly DayEntry[]): WeekdayStat[] {
  const buckets: Array<{ total: Kurus; count: number }> = Array.from(
    { length: 7 }, () => ({ total: ZERO, count: 0 }),
  );

  for (const day of days) {
    if (!day.summary.isWorkedDay) continue;
    const bucket = buckets[weekdayIndex(day.date)];
    bucket.total = add(bucket.total, day.summary.profit.cashProfit);
    bucket.count += 1;
  }

  const averages = buckets.map((b) => earningsPerDay(b.total, b.count));

  const best = averages.reduce<number>(
    (acc, a) => (a != null && a > acc ? a : acc), 0,
  );

  return buckets.map((b, index) => ({
    index,
    dayCount: b.count,
    cashProfit: b.total,
    average: averages[index],
    ratio: best > 0 && averages[index] != null && averages[index]! > 0
      ? averages[index]! / best
      : 0,
  }));
}

/**
 * İki dönem arasındaki yüzde değişim.
 *
 * ÖNCEKİ DÖNEM SIFIRSA `null` döner — "%∞ arttı" diye bir şey yok ve
 * sıfırdan bölme, ekranda `Infinity` yazdıran bir hataya dönüşür.
 * Önceki dönem negatifse de `null`: zarardan kâra geçişi yüzdeyle
 * anlatmak sayının işaretini gizler.
 */
export function percentChange(
  current: Kurus, previous: Kurus,
): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}
