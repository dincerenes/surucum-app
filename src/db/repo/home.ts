/**
 * Anasayfa kartlarının verisi — tek okumada.
 *
 * Ay ve son yedi gün aynı gün özetlerinden geliyor: ayın başı yedi günden
 * yeniyse ayrıca geriye okunuyor. Hesap `src/lib/home.ts` içinde.
 */

import { type BusinessDate, addDays, minBusinessDate, startOfMonth } from '@/lib/business-date';
import type { DaySummary } from '@/lib/day-summary';
import {
  type DailyBar, type MonthlyAverages, bestDay, lastDays, monthlyAverages,
} from '@/lib/home';
import type { DayEntry } from '@/lib/stats';
import { type PeriodTotals, calculatePeriodTotals } from '@/lib/stats';
import type { UnixMs } from './_base';
import { listDaySummaries } from './summary';

export interface HomeOverview {
  /** Bugünün özeti — vardiya kapalıyken "Günlük kazancın". Kayıt yoksa `null`. */
  today: DaySummary | null;
  month: PeriodTotals;
  averages: MonthlyAverages;
  week: DailyBar[];
  /** Bu ayın en iyi günü. Kârlı çalışılmış gün yoksa `null`. */
  best: DayEntry | null;
}

export function getHomeOverview(
  userId: string, today: BusinessDate, now: UnixMs = Date.now(),
): HomeOverview {
  const monthStart = startOfMonth(today);
  const weekStart = addDays(today, -6);
  const days = listDaySummaries(userId, minBusinessDate(monthStart, weekStart), today, now);

  const monthDays = days.filter((d) => d.date >= monthStart);
  const month = calculatePeriodTotals(monthDays);
  return {
    today: days.find((d) => d.date === today)?.summary ?? null,
    month,
    averages: monthlyAverages(monthDays),
    week: lastDays(days, today),
    best: bestDay(monthDays),
  };
}
