import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { BusinessDate } from './business-date.ts';
import type { DaySummary } from './day-summary.ts';
import { barRatio, bestDay, lastDays, monthlyAverages } from './home.ts';
import type { Kurus } from './money.ts';
import type { DayEntry } from './stats.ts';

const d = (s: string) => s as BusinessDate;
const k = (n: number) => n as Kurus;

function day(date: string, cashProfit: number, extra: Partial<DaySummary> = {}): DayEntry {
  return {
    date: d(date),
    summary: {
      hasActivity: true,
      isWorkedDay: true,
      profit: { cashProfit: k(cashProfit) },
      ...extra,
    } as DaySummary,
  };
}

describe('son 7 gün', () => {
  it('kaydı olmayan gün boş çubuk, bugün en sağda', () => {
    const bars = lastDays([day('2026-09-23', 1000), day('2026-09-20', 500)], d('2026-09-23'));
    assert.equal(bars.length, 7);
    assert.equal(bars[0].date, '2026-09-17');
    assert.equal(bars[6].date, '2026-09-23');
    assert.equal(bars[6].isToday, true);
    assert.equal(bars[6].cashProfit, 1000);
    assert.equal(bars[3].cashProfit, 500);
    assert.equal(bars[4].cashProfit, null);
  });

  it('çubuk oranı en iyi güne göre, zarar sıfır', () => {
    const bars = lastDays([day('2026-09-23', 1000), day('2026-09-22', -300), day('2026-09-21', 500)], d('2026-09-23'));
    assert.equal(barRatio(k(1000), bars), 1);
    assert.equal(barRatio(k(500), bars), 0.5);
    assert.equal(barRatio(k(-300), bars), 0);
    assert.equal(barRatio(null, bars), 0);
  });
});

describe('aylık ortalama', () => {
  /** Ortalamaların okuduğu alanlarıyla bir gün özeti. */
  function full(date: string, o: {
    cash: number; revenue?: number; rides?: number; minutes?: number;
    km?: number | null; distance?: 'complete' | 'partial' | 'unknown' | 'none'; open?: number;
  }): DayEntry {
    const zero = k(0);
    return {
      date: d(date),
      summary: {
        hasActivity: true,
        isWorkedDay: true,
        rideCount: o.rides ?? 0,
        durationMinutes: o.minutes ?? 0,
        distanceKm: o.km ?? null,
        profit: {
          revenue: k(o.revenue ?? o.cash), cashProfit: k(o.cash), trueProfit: k(o.cash),
          commission: zero, fuelPaid: zero, expensesPaid: zero, wearShare: zero,
        },
        completeness: {
          closedShiftCount: o.open ? 0 : 1, openShiftCount: o.open ?? 0,
          distance: o.distance ?? (o.km != null ? 'complete' : 'unknown'),
          shiftsMissingDistance: 0, shiftsMissingFuel: 0, shiftsMissingCommission: 0,
          fillsNotCountedKurus: zero, offDayFillsKurus: zero,
        },
      } as unknown as DaySummary,
    };
  }

  it('çalışılmış gün yoksa hepsi boş', () => {
    const a = monthlyAverages([]);
    assert.equal(a.perDay, null);
    assert.equal(a.ridesPerDay, null);
    assert.equal(a.kmPerDay, null);
    assert.equal(a.minutesPerDay, null);
  });

  it('km ortalaması yalnızca km\'si TAM girilen günlerden', () => {
    const a = monthlyAverages([
      full('2026-09-01', { cash: 2000, rides: 10, minutes: 600, km: 300 }),
      full('2026-09-02', { cash: 2000, rides: 15, minutes: 600, km: 300 }),
      full('2026-09-03', { cash: 2000, rides: 10, minutes: 600, km: 100, distance: 'partial' }),
      full('2026-09-04', { cash: 2000, rides: 15, minutes: 600 }),
    ]);
    assert.equal(a.ridesPerDay, 12.5);
    assert.equal(a.kmPerDay, 300);
    assert.equal(a.minutesPerDay, 600);
  });

  it('açık vardiyalı gün ortalamaya girmez', () => {
    const days = [1, 2, 3, 4].map((n) => full(`2026-09-0${n}`, { cash: 200000, minutes: 600, rides: 10 }));
    const a = monthlyAverages([...days, full('2026-09-05', { cash: 60000, rides: 3, open: 1 })]);
    assert.equal(a.workedDayCount, 4);
    assert.equal(a.perDay, 200000);
    assert.equal(a.minutesPerDay, 600);
    assert.equal(a.ridesPerDay, 10);
  });
});

describe('en iyi gün', () => {
  it('cebe kalanı en yüksek çalışılmış gün; eşitlikte en yenisi', () => {
    const b = bestDay([day('2026-09-01', 500), day('2026-09-02', 900), day('2026-09-03', 900)]);
    assert.equal(b?.date, '2026-09-03');
  });

  it('zararlı ya da çalışılmamış gün aday değil', () => {
    assert.equal(bestDay([day('2026-09-01', -500)]), null);
    assert.equal(bestDay([day('2026-09-01', 800, { isWorkedDay: false })]), null);
    assert.equal(bestDay([]), null);
  });
});
