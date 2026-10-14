/**
 * Anasayfa kartlarının aritmetiği.
 *
 * Veritabanı bilmez: gün özetlerini ve dönem toplamlarını alır, kartların
 * gösterdiği sayıları üretir. Okuma `src/db/repo/home.ts` içinde.
 */

import { type BusinessDate, addDays } from './business-date.ts';
import type { Kurus } from './money.ts';
import { kmStats } from './insights.ts';
import { type DayEntry, calculatePeriodTotals } from './stats.ts';

export interface DailyBar {
  date: BusinessDate;
  /** O günün cebe kalanı. Kaydı olmayan günde `null` — sıfır değil. */
  cashProfit: Kurus | null;
  isToday: boolean;
}

/**
 * Son `n` günün çubukları — en eski solda, bugün sağda.
 *
 * Kaydı olmayan gün de çubuk olarak duruyor (boş): yedi günün beşinde
 * çalışan sürücü iki boşluğu görmeli, grafik o günleri yutup beş günü
 * yan yana dizerse hafta olduğundan dolu görünür.
 */
export function lastDays(
  entries: readonly DayEntry[], today: BusinessDate, n = 7,
): DailyBar[] {
  const byDate = new Map(entries.map((e) => [e.date, e.summary]));
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(today, i - (n - 1));
    const summary = byDate.get(date);
    return {
      date,
      cashProfit: summary?.hasActivity ? summary.profit.cashProfit : null,
      isToday: date === today,
    };
  });
}

export interface MonthlyAverages {
  /** Çalışılan gün sayısı — ortalamaların paydası. */
  workedDayCount: number;
  /** Gün başına cebe kalan — kartın büyük sayısı. */
  perDay: Kurus | null;
  revenuePerDay: Kurus | null;
  ridesPerDay: number | null;
  /**
   * Gün başına km — YALNIZCA km'si TAM girilmiş günlerden, İstatistik'in
   * km kartıyla aynı kuraldan (`kmStats`). Eskiden km'si yarım girilmiş
   * gün de sayılıyordu: 200 km'lik gün ile ikinci vardiyasının km'si boş
   * 100 km'lik gün Anasayfa'da 150, İstatistik'te 200 yazıyordu.
   */
  kmPerDay: number | null;
  minutesPerDay: number | null;
}

/**
 * Ayın gün başına ortalamaları — BİTMİŞ günlerden.
 *
 * Açık vardiyalı gün dışarıda: parası sayılıyor ama süresi, km'si,
 * komisyonu ve yakıtı vardiya bitince soruluyor. Katılsa her ortalama
 * aşağı çekiliyordu — dört 10 saatlik günün yanına bugünün açık
 * vardiyası eklenince "süre / gün" 8 saat, "cebe kalan" 2.000 ₺ yerine
 * 1.720 ₺ yazıyordu. Bitmiş gün yoksa hepsi `null`.
 */
export function monthlyAverages(days: readonly DayEntry[]): MonthlyAverages {
  const done = days.filter((d) => d.summary.isWorkedDay
    && d.summary.completeness.openShiftCount === 0);
  const t = calculatePeriodTotals(done);
  const count = t.workedDayCount;
  return {
    workedDayCount: count,
    perDay: t.perDay,
    revenuePerDay: t.revenuePerDay,
    ridesPerDay: count > 0 ? t.rideCount / count : null,
    kmPerDay: kmStats(done).kmPerDay,
    minutesPerDay: count > 0 ? Math.round(t.durationMinutes / count) : null,
  };
}

/** Çubuğun yüksekliği 0–1: en iyi güne göre. Zarar ve boş gün 0. */
export function barRatio(value: Kurus | null, bars: readonly DailyBar[]): number {
  const best = bars.reduce((acc, b) => Math.max(acc, b.cashProfit ?? 0), 0);
  if (value == null || value <= 0 || best <= 0) return 0;
  return value / best;
}

/**
 * Dönemin EN İYİ GÜNÜ — cebe kalanı en yüksek çalışılmış gün.
 *
 * Yalnızca çalışılmış ve kârlı günler aday: zararlı bir günü "en iyi"
 * diye göstermek teselli değil alay olur. Eşitlikte en yenisi.
 */
export function bestDay(entries: readonly DayEntry[]): DayEntry | null {
  let best: DayEntry | null = null;
  for (const e of entries) {
    if (!e.summary.isWorkedDay || e.summary.profit.cashProfit <= 0) continue;
    if (
      best == null
      || e.summary.profit.cashProfit > best.summary.profit.cashProfit
      || (e.summary.profit.cashProfit === best.summary.profit.cashProfit && e.date > best.date)
    ) best = e;
  }
  return best;
}
