/**
 * İstatistik ekranının ve verimlilik puanının verisi.
 *
 * Yalnızca okur; aritmetik `src/lib/insights.ts` ve `efficiency.ts`
 * içinde ve native SQLite olmadan test ediliyor.
 */

import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { getDb } from '../client';
import { expenseCategories, expenses, rides } from '../schema';
import { type UnixMs, alive } from './_base';
import { getFirstRecordDate, listDaySummaries } from './summary';
import { type BusinessDate, addDays } from '@/lib/business-date';
import {
  BASELINE_WINDOW_DAYS, type DayScore, averageScore, scoreDays,
} from '@/lib/efficiency';
import {
  type CategoryAmount, type CostSlice, type HotWindow, type HourBucket, type KmStats,
  type RideStats, type TimeStats, type TrendBar, costBreakdown, hotWindow, hourlyBuckets,
  kmStats, rideStats, timeStats, trendBars,
} from '@/lib/insights';
import type { Kurus } from '@/lib/money';
import { type PeriodKey, periodBounds, previousPeriodLabel } from '@/lib/period';
import {
  type PeriodTotals, type WeekdayStat, calculatePeriodTotals, summarizeByWeekday,
} from '@/lib/stats';

export interface StatsOverview {
  from: BusinessDate;
  to: BusinessDate;
  totals: PeriodTotals;
  /** Önceki dönemin aynı uzunluktaki kısmı — "Tüm zamanlar"da yok. */
  previous: PeriodTotals | null;
  /** Karşılaştırma notunun başlığı ("Geçen ayın ilk 10 günü"). */
  previousLabel: string | null;
  trend: { unit: 'day' | 'month'; bars: TrendBar[] };
  scores: DayScore[];
  averageScore: number | null;
  time: TimeStats;
  hours: HourBucket[];
  hot: HotWindow | null;
  hourRideCount: number;
  weekdays: WeekdayStat[];
  rides: RideStats;
  km: KmStats;
  costs: { total: Kurus; slices: CostSlice[] };
}

/**
 * Seçilen dönemin bütün kartları — tek okumada.
 *
 * Gün özetleri dönemden 30 gün ÖNCESİNDEN okunuyor: dönemin ilk günleri
 * de puanlanabilsin diye (her gün kendi önceki 30 gününe göre).
 */
export function getStatsOverview(
  userId: string, period: PeriodKey, today: BusinessDate, now: UnixMs = Date.now(),
): StatsOverview {
  const oldest = period === 'all' ? getFirstRecordDate(userId) : null;
  const range = periodBounds(period, today, oldest);
  const { from, to, previousFrom, previousTo } = range;

  const all = listDaySummaries(userId, addDays(from, -BASELINE_WINDOW_DAYS), to, now);
  const days = all.filter((d) => d.date >= from);
  const scores = scoreDays(all, from, to);
  const times = readRideTimes(userId, from, to);
  const hours = hourlyBuckets(times);

  return {
    from,
    to,
    totals: calculatePeriodTotals(days),
    previous: previousFrom && previousTo
      ? calculatePeriodTotals(listDaySummaries(userId, previousFrom, previousTo, now))
      : null,
    previousLabel: previousPeriodLabel(period, range),
    trend: trendBars(days, from, to),
    scores,
    averageScore: averageScore(scores),
    time: timeStats(days),
    hours,
    hot: hotWindow(hours),
    hourRideCount: times.length,
    weekdays: summarizeByWeekday(days),
    rides: rideStats(days),
    km: kmStats(days),
    costs: costBreakdown(days, readExpensesByCategory(userId, from, to)),
  };
}

export interface HomeScore {
  /** Son puanlanmış gün. Son 30 günde yoksa `null`. */
  latest: DayScore | null;
  /** Son 30 günün ortalama puanı. */
  average: number | null;
}

/**
 * Anasayfadaki halka: SON PUANLANMIŞ gün.
 *
 * Bugün vardiya açıkken bugün puanlanamıyor (süre vardiya bitince
 * soruluyor); halka o zaman son kapanmış günü gösteriyor ve tarihini
 * söylüyor.
 */
export function getHomeScore(
  userId: string, today: BusinessDate, now: UnixMs = Date.now(),
): HomeScore {
  const from = addDays(today, -BASELINE_WINDOW_DAYS);
  const all = listDaySummaries(userId, addDays(from, -BASELINE_WINDOW_DAYS), today, now);
  const scores = scoreDays(all, from, today);
  return {
    latest: scores[scores.length - 1] ?? null,
    average: averageScore(scores),
  };
}

/** Sıcak saatler için yolcuların anı ve cirosu. */
function readRideTimes(userId: string, from: BusinessDate, to: BusinessDate) {
  return getDb().select({
    occurredAt: rides.occurredAt,
    revenueKurus: sql<Kurus>`${rides.grossAmountKurus} + ${rides.tipKurus}`,
  }).from(rides).where(and(
    alive(rides, userId),
    gte(rides.businessDate, from),
    lte(rides.businessDate, to),
  )).all();
}

/**
 * Giderler kategoriye göre. Kategori silinmiş ya da başka hesabınsa
 * "Diğer" — tutar yine dağılımda kalmalı, gün özetindeki toplamla aynı
 * satırlar.
 */
function readExpensesByCategory(
  userId: string, from: BusinessDate, to: BusinessDate,
): CategoryAmount[] {
  const rows = getDb().select({
    categoryId: expenses.categoryId,
    name: expenseCategories.name,
    amount: sql<number>`sum(${expenses.amountKurus})`,
  }).from(expenses)
    .leftJoin(expenseCategories, and(
      eq(expenseCategories.id, expenses.categoryId),
      eq(expenseCategories.userId, expenses.userId),
    ))
    .where(and(
      alive(expenses, userId),
      gte(expenses.businessDate, from),
      lte(expenses.businessDate, to),
    ))
    .groupBy(expenses.categoryId)
    .all();

  return rows.map((r) => ({
    categoryId: r.categoryId,
    name: r.name ?? 'Diğer',
    amount: Number(r.amount ?? 0) as Kurus,
  }));
}

