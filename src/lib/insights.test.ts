import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { BusinessDate } from './business-date.ts';
import type { DaySummary } from './day-summary.ts';
import {
  costBreakdown, hotWindow, hourlyBuckets, kmStats, rideStats, timeStats, trendBars, trendRatio,
} from './insights.ts';
import type { Kurus } from './money.ts';
import type { DayEntry } from './stats.ts';

const d = (s: string) => s as BusinessDate;
const k = (n: number) => n as Kurus;

interface DayOpts {
  cash?: number; revenue?: number; rides?: number; minutes?: number; km?: number | null;
  distance?: 'complete' | 'partial' | 'unknown' | 'none'; open?: number; closed?: number;
  commission?: number; fuel?: number; expenses?: number; wear?: number; worked?: boolean;
}

function day(date: string, o: DayOpts = {}): DayEntry {
  return {
    date: d(date),
    summary: {
      hasActivity: true,
      isWorkedDay: o.worked ?? true,
      rideCount: o.rides ?? 0,
      durationMinutes: o.minutes ?? 0,
      distanceKm: o.km ?? null,
      profit: {
        revenue: k(o.revenue ?? 0),
        cashProfit: k(o.cash ?? 0),
        trueProfit: k(o.cash ?? 0),
        commission: k(o.commission ?? 0),
        fuelPaid: k(o.fuel ?? 0),
        expensesPaid: k(o.expenses ?? 0),
        wearShare: k(o.wear ?? 0),
        fixedShare: k(0),
      },
      completeness: {
        openShiftCount: o.open ?? 0,
        closedShiftCount: o.closed ?? 1,
        distance: o.distance ?? (o.km != null ? 'complete' : 'unknown'),
        shiftsMissingDistance: 0,
        shiftsMissingFuel: 0,
        shiftsMissingCommission: 0,
        fillsNotCountedKurus: k(0),
        offDayFillsKurus: k(0),
      },
    } as unknown as DaySummary,
  };
}

describe('zaman verimliliği', () => {
  it('açık vardiyalı gün hesaba girmiyor', () => {
    const t = timeStats([
      day('2026-09-21', { cash: 60000, rides: 20, minutes: 600, closed: 2 }),
      day('2026-09-22', { cash: 30000, rides: 10, minutes: 300 }),
      day('2026-09-23', { cash: 90000, rides: 30, minutes: 0, open: 1, closed: 0 }),
    ]);
    assert.equal(t.dayCount, 2);
    assert.equal(t.totalMinutes, 900);
    assert.equal(t.perHour, 6000);
    assert.equal(t.minutesPerShift, 300);
    assert.equal(t.ridesPerHour, 2);
    assert.equal(t.minutesPerRide, 30);
  });

  it('veri yoksa oranlar boş', () => {
    const t = timeStats([]);
    assert.equal(t.perHour, null);
    assert.equal(t.minutesPerRide, null);
  });
});

describe('yolcu analizi', () => {
  it('gün başına, yolcu başına ve en yoğun gün', () => {
    const r = rideStats([
      day('2026-09-21', { rides: 10, revenue: 50000, cash: 30000 }),
      day('2026-09-22', { rides: 30, revenue: 150000, cash: 90000 }),
      day('2026-09-23', { worked: false, rides: 0 }),
    ]);
    assert.equal(r.rideCount, 40);
    assert.equal(r.ridesPerDay, 20);
    assert.equal(r.revenuePerRide, 5000);
    assert.equal(r.cashPerRide, 3000);
    assert.deepEqual(r.busiestDay, { date: '2026-09-22', rideCount: 30 });
  });
});

describe('km analizi', () => {
  it('yalnızca km\'si tam girilmiş günler', () => {
    const s = kmStats([
      day('2026-09-21', { km: 200, rides: 20, revenue: 200000, cash: 100000, fuel: 30000, wear: 10000 }),
      day('2026-09-22', { km: 100, distance: 'partial', rides: 30, revenue: 900000 }),
      day('2026-09-23', { km: null, rides: 5 }),
    ]);
    assert.equal(s.dayCount, 1);
    assert.equal(s.skippedDayCount, 2);
    assert.equal(s.totalKm, 200);
    assert.equal(s.revenuePerKm, 1000);
    assert.equal(s.cashPerKm, 500);
    assert.equal(s.costPerKm, 200);
    assert.equal(s.kmPerRide, 10);
  });

  it('hiç km yoksa hepsi boş', () => {
    const s = kmStats([day('2026-09-23', { rides: 5 })]);
    assert.equal(s.totalKm, null);
    assert.equal(s.costPerKm, null);
  });
});

describe('sıcak saatler', () => {
  const at = (h: number, m = 0) => new Date(2026, 8, 23, h, m).getTime();

  it('yerel saate göre kovalar', () => {
    const b = hourlyBuckets([
      { occurredAt: at(18), revenueKurus: k(100) },
      { occurredAt: at(18, 45), revenueKurus: k(200) },
      { occurredAt: at(9), revenueKurus: k(50) },
    ]);
    assert.equal(b.length, 24);
    assert.equal(b[18].rideCount, 2);
    assert.equal(b[18].revenue, 300);
    assert.equal(b[18].ratio, 1);
    assert.equal(b[9].ratio, 0.5);
  });

  it('en yoğun 3 saat, gece yarısını aşabilir', () => {
    const rides = [23, 23, 0, 1, 1, 12].map((h) => ({ occurredAt: at(h), revenueKurus: k(1) }));
    const w = hotWindow(hourlyBuckets(rides))!;
    assert.equal(w.startHour, 23);
    assert.equal(w.endHour, 2);
    assert.equal(w.rideCount, 5);
    assert.equal(Math.round(w.share * 100), 83);
    assert.equal(hotWindow(hourlyBuckets([])), null);
  });
});

describe('gider dağılımı', () => {
  it('sıfır dilim yok, büyükten küçüğe, paylar toplamı 1', () => {
    const r = costBreakdown(
      [day('2026-09-23', { commission: 20000, fuel: 50000, wear: 10000, expenses: 20000 })],
      [{ categoryId: 'a', name: 'Yemek', amount: k(15000) }, { categoryId: 'b', name: 'Otopark', amount: k(5000) }],
    );
    assert.equal(r.total, 100000);
    assert.deepEqual(r.slices.map((s) => s.label), ['Yakıt', 'Komisyon', 'Yemek', 'Yıpranma payı', 'Otopark']);
    assert.equal(r.slices.reduce((a, s) => a + s.share, 0), 1);
  });
});

describe('kazanç seyri', () => {
  it('31 güne kadar gün gün, boş gün boş çubuk', () => {
    const t = trendBars([day('2026-09-02', { cash: 500 })], d('2026-09-01'), d('2026-09-03'));
    assert.equal(t.unit, 'day');
    assert.deepEqual(t.bars.map((b) => b.cashProfit), [null, 500, null]);
  });

  it('daha uzunsa ay ay', () => {
    const t = trendBars(
      [day('2026-07-05', { cash: 100 }), day('2026-09-02', { cash: 300 })],
      d('2026-07-01'), d('2026-09-30'),
    );
    assert.equal(t.unit, 'month');
    assert.deepEqual(t.bars.map((b) => [b.key, b.cashProfit]), [
      ['2026-07', 100], ['2026-08', null], ['2026-09', 300],
    ]);
    assert.equal(trendRatio(k(150), t.bars), 0.5);
  });
});
