import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  calculatePeriodTotals, percentChange, summarizeByWeekday, totalsByMonth,
} from './stats.ts';
import type { DayEntry } from './stats.ts';
import { asBusinessDate } from './business-date.ts';
import { calculateDaySummary } from './day-summary.ts';
import type { Kurus } from './money.ts';

const k = (n: number) => n as Kurus;

/** Tek vardiyalı, tek seferlik bir gün üretir. */
function day(
  date: string,
  opts: {
    gross?: number;
    commission?: number;
    expense?: number;
    km?: number | null;
    minutes?: number | null;
    wearPerKm?: number;
  } = {},
): DayEntry {
  const {
    gross = 0, commission = 0, expense = 0, km = null,
    minutes = null, wearPerKm = 250,
  } = opts;

  return {
    date: asBusinessDate(date),
    summary: calculateDaySummary({
      rides: gross > 0
        ? [{ grossAmountKurus: k(gross), commissionKurus: k(0), tipKurus: k(0) }]
        : [],
      expenses: expense > 0 ? [{ amountKurus: k(expense) }] : [],
      fuelLogs: [],
      shifts: [{
        startedAt: 0,
        endedAt: 1,
        workedMinutes: minutes,
        distanceKm: km,
        commissionKurus: commission > 0 ? k(commission) : null,
        wearPerKmKurus: k(wearPerKm),
      }],
      now: 1,
    }),
  };
}

describe('dönem toplamları', () => {
  it('vardiya sayısı, gün başına ciro ve km\'si bilinen gün sayısı', () => {
    const t = calculatePeriodTotals([
      day('2026-09-14', { gross: 100_000, km: 100 }),
      day('2026-09-15', { gross: 300_000, km: null }),
    ]);
    assert.equal(t.shiftCount, 2);
    assert.equal(t.revenuePerDay, 200_000);
    assert.equal(t.distanceDayCount, 1);
    assert.equal(calculatePeriodTotals([]).revenuePerDay, null);
  });

  it('boş dönem sıfırlarla döner, oranlar null', () => {
    const t = calculatePeriodTotals([]);
    assert.equal(t.dayCount, 0);
    assert.equal(t.revenue, 0);
    assert.equal(t.perHour, null);
    assert.equal(t.perKm, null);
    assert.equal(t.perDay, null);
    assert.equal(t.distanceKm, null);
  });

  it('günlerin üç satırı toplanıyor', () => {
    const t = calculatePeriodTotals([
      day('2026-09-14', { gross: 100_000, commission: 20_000, km: 100 }),
      day('2026-09-15', { gross: 200_000, commission: 40_000, km: 200 }),
    ]);

    assert.equal(t.dayCount, 2);
    assert.equal(t.revenue, 300_000);
    assert.equal(t.commission, 60_000);
    assert.equal(t.cashProfit, 240_000);
    // Yıpranma: (100 + 200) km × 250 kuruş = 75.000
    assert.equal(t.wearShare, 75_000);
    assert.equal(t.trueProfit, 165_000);
    assert.equal(t.distanceKm, 300);
  });

  it('ekrandaki satırlar toplanınca gerçek kâra ULAŞIYOR', () => {
    const t = calculatePeriodTotals([
      day('2026-09-14', { gross: 447_50, commission: 215_50, expense: 150_00, km: 238 }),
    ]);

    assert.equal(
      t.revenue - t.commission - t.fuelPaid - t.expensesPaid,
      t.cashProfit,
    );
    assert.equal(t.cashProfit - t.wearShare, t.trueProfit);
  });

  it('kilometre HİÇ girilmemişse null — sıfır değil', () => {
    const t = calculatePeriodTotals([
      day('2026-09-14', { gross: 100_000, km: null }),
      day('2026-09-15', { gross: 100_000, km: null }),
    ]);
    assert.equal(t.distanceKm, null);
    assert.equal(t.perKm, null);
    assert.equal(t.shiftsMissingDistance, 2);
  });

  it('bazı günlerin kilometresi varsa toplam bilinenlerden gelir', () => {
    const t = calculatePeriodTotals([
      day('2026-09-14', { gross: 100_000, km: 120 }),
      day('2026-09-15', { gross: 100_000, km: null }),
    ]);
    assert.equal(t.distanceKm, 120);
    assert.equal(t.shiftsMissingDistance, 1);
  });

  it('gün başına ortalama yalnızca ÇALIŞILAN günlere bölünür', () => {
    const t = calculatePeriodTotals([
      day('2026-09-14', { gross: 100_000 }),
      day('2026-09-15', { gross: 200_000 }),
    ]);
    assert.equal(t.perDay, 150_000);
  });

  it('iki vardiyanın birinde km eksik olan gün dönemde KAYBOLMAZ', () => {
    const partial: DayEntry = {
      date: asBusinessDate('2026-09-16'),
      summary: calculateDaySummary({
        rides: [], expenses: [], fuelLogs: [],
        shifts: [
          { startedAt: 0, endedAt: 1, workedMinutes: null, distanceKm: 100 },
          { startedAt: 2, endedAt: 3, workedMinutes: null, distanceKm: null },
        ],
        now: 4,
      }),
    };
    const t = calculatePeriodTotals([partial]);
    assert.equal(t.distanceKm, 100);
    assert.equal(t.shiftsMissingDistance, 1);
  });

  it('yalnızca gider ya da depo alımı olan gün çalışılmış sayılmaz, maliyeti toplamda kalır', () => {
    const onlyCost = (date: string, fuel: number, expense: number): DayEntry => ({
      date: asBusinessDate(date),
      summary: calculateDaySummary({
        rides: [],
        expenses: expense > 0 ? [{ amountKurus: k(expense) }] : [],
        fuelLogs: fuel > 0 ? [{ totalAmountKurus: k(fuel), vehicleId: 'V' }] : [],
        shifts: [],
        now: 1,
      }),
    });
    const t = calculatePeriodTotals([
      day('2026-09-14', { gross: 100_000 }),
      onlyCost('2026-09-13', 100_000, 0),   // Pazar: depo alımı
      onlyCost('2026-09-12', 0, 5_000),     // Cumartesi: yalnız gider
    ]);
    assert.equal(t.dayCount, 3);
    assert.equal(t.workedDayCount, 1);
    assert.equal(t.perDay, 95_000);           // 100.000 − 5.000, tek güne
    assert.equal(t.expensesPaid, 5_000);
    assert.equal(t.fuelPaid, 0, 'gün dışı depo alımı maliyete girmez');
    assert.equal(t.offDayFillsKurus, 100_000);
    assert.equal(t.shiftsMissingDistance, 1, 'yalnızca vardiyalı gün sayılır');

    const sunday = summarizeByWeekday([
      day('2026-09-14', { gross: 100_000 }),
      onlyCost('2026-09-13', 100_000, 0),
    ])[6];
    assert.equal(sunday.dayCount, 0, 'depo alımı Pazar\'ı çalışılmış göstermez');
  });

  it('gün dışı depo alımı ertesi günün tüketimiyle İKİ KEZ düşülmez', () => {
    const sunday: DayEntry = {
      date: asBusinessDate('2026-09-13'),
      summary: calculateDaySummary({
        rides: [], expenses: [], fuelLogs: [{ totalAmountKurus: k(100_000), vehicleId: 'V' }],
        shifts: [], now: 1,
      }),
    };
    const monday: DayEntry = {
      date: asBusinessDate('2026-09-14'),
      summary: calculateDaySummary({
        rides: [{ grossAmountKurus: k(200_000), commissionKurus: k(0), tipKurus: k(0) }],
        expenses: [], fuelLogs: [],
        shifts: [{
          startedAt: 0, endedAt: 1, workedMinutes: null, distanceKm: 100, vehicleId: 'V',
          fuelConsumptionPer100Km: 10_000, fuelPriceKurus: k(5_000),
        }],
        now: 1,
      }),
    };
    const t = calculatePeriodTotals([sunday, monday]);
    assert.equal(t.fuelPaid, 50_000);          // 1.500 ₺ değil
    assert.equal(t.workedDayCount, 1);
  });
});

describe('haftanın günleri', () => {
  it('yedi gün de dönüyor, kaydı olmayanın ortalaması null', () => {
    const stats = summarizeByWeekday([]);
    assert.equal(stats.length, 7);
    for (const s of stats) {
      assert.equal(s.dayCount, 0);
      assert.equal(s.average, null);
      assert.equal(s.ratio, 0);
    }
  });

  it('TOPLAM değil ORTALAMA karşılaştırılıyor', () => {
    // 14 Eylül 2026 Pazartesi, 15'i Salı.
    const stats = summarizeByWeekday([
      // İki Pazartesi, her biri 100 TL → ortalama 100
      day('2026-09-14', { gross: 10_000 }),
      day('2026-09-21', { gross: 10_000 }),
      // Tek Salı, 150 TL → ortalama 150, toplamı daha düşük
      day('2026-09-15', { gross: 15_000 }),
    ]);

    const pazartesi = stats[0];
    const sali = stats[1];

    assert.equal(pazartesi.cashProfit, 20_000);  // toplamı daha yüksek
    assert.equal(sali.cashProfit, 15_000);

    assert.equal(pazartesi.average, 10_000);
    assert.equal(sali.average, 15_000);

    // Oran ortalamadan geliyor: Salı en iyi gün.
    assert.equal(sali.ratio, 1);
    assert.equal(pazartesi.ratio, 10_000 / 15_000);
  });

  it('zararlı gün şeritte sıfır oran alır — zarar tonun içinde saklanmaz', () => {
    const stats = summarizeByWeekday([
      day('2026-09-14', { gross: 10_000, expense: 30_000 }),  // Pazartesi: zarar
      day('2026-09-15', { gross: 20_000 }),                    // Salı: kâr
    ]);

    assert.ok(stats[0].average! < 0);
    assert.equal(stats[0].ratio, 0);
    assert.equal(stats[1].ratio, 1);
  });
});

describe('yüzde değişim', () => {
  it('artış ve azalış', () => {
    assert.equal(percentChange(k(150), k(100)), 50);
    assert.equal(percentChange(k(50), k(100)), -50);
  });

  it('önceki dönem sıfırsa null — yüzde sonsuz olmaz', () => {
    assert.equal(percentChange(k(100), k(0)), null);
  });

  it('önceki dönem negatifse null — işaret yüzdenin içinde kaybolmaz', () => {
    assert.equal(percentChange(k(100), k(-50)), null);
  });
});

describe('totalsByMonth', () => {
  it('günler aylarına toplanır, kaydı olmayan ay yok', () => {
    const months = totalsByMonth([
      day('2026-08-30', { gross: 100_000 }),
      day('2026-09-01', { gross: 200_000 }),
      day('2026-09-15', { gross: 300_000 }),
    ]);
    assert.deepEqual([...months.keys()].sort(), ['2026-08', '2026-09']);
    assert.equal(months.get('2026-09')?.revenue, 500_000);
    assert.equal(months.get('2026-09')?.shiftCount, 2);
    assert.equal(months.get('2026-07'), undefined);
  });
});
