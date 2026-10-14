import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type BusinessDate, addDays } from './business-date.ts';
import type { DaySummary } from './day-summary.ts';
import {
  averageScore, baselineFor, median, ratioToScore, scoreBand, scoreDay, scoreDays,
} from './efficiency.ts';
import type { Kurus } from './money.ts';
import type { DayEntry } from './stats.ts';

const d = (s: string) => s as BusinessDate;

/** Saat başına `perHour` kuruş kazanılmış, 10 saatlik kapalı bir gün. */
function day(
  date: string, perHour: number, opts: { perKm?: number | null; open?: number; cash?: number } = {},
): DayEntry {
  return {
    date: d(date),
    summary: {
      isWorkedDay: true,
      hasActivity: true,
      perHour: perHour as Kurus,
      perKm: (opts.perKm ?? null) as Kurus | null,
      profit: { cashProfit: (opts.cash ?? perHour * 10) as Kurus },
      completeness: { openShiftCount: opts.open ?? 0 },
    } as DaySummary,
  };
}

/** `to`'dan geriye `n` gün, hepsi aynı saat başına kazançla. */
function history(to: string, n: number, perHour: number, perKm?: number): DayEntry[] {
  return Array.from({ length: n }, (_, i) => day(addDays(d(to), -i), perHour, { perKm }));
}

describe('ortanca', () => {
  it('tek ve çift sayıda', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 2, 3]), 2.5);
    assert.equal(median([]), null);
  });
});

describe('oran → puan', () => {
  it('normal gün 50, iki katı tavan, zarar sıfır', () => {
    assert.equal(ratioToScore(1), 50);
    assert.equal(ratioToScore(1.4), 70);
    assert.equal(ratioToScore(0.6), 30);
    assert.equal(ratioToScore(3), 100);
    assert.equal(ratioToScore(-1), 0);
    assert.equal(ratioToScore(Number.NaN), 0);
  });

  it('bantlar', () => {
    assert.equal(scoreBand(80), 'great');
    assert.equal(scoreBand(60), 'good');
    assert.equal(scoreBand(50), 'normal');
    assert.equal(scoreBand(35), 'low');
    assert.equal(scoreBand(10), 'poor');
  });
});

describe('ölçü', () => {
  it('önceki gün yoksa ölçü yok, tek gün yeterli', () => {
    assert.equal(baselineFor([], d('2026-09-23')), null);
    const b = baselineFor(history('2026-09-22', 1, 30000), d('2026-09-23'))!;
    assert.equal(b.dayCount, 1);
    assert.equal(b.perHour, 30000);
  });

  it('günün kendisi ölçüye girmiyor', () => {
    const entries = [...history('2026-09-22', 5, 30000), day('2026-09-23', 90000)];
    assert.equal(baselineFor(entries, d('2026-09-23'))!.perHour, 30000);
  });

  it('30 günden eski gün ölçüye girmiyor', () => {
    const entries = [...history('2026-09-22', 5, 30000), ...history('2026-08-20', 10, 90000)];
    const b = baselineFor(entries, d('2026-09-23'))!;
    assert.equal(b.dayCount, 5);
    assert.equal(b.perHour, 30000);
  });

  it('açık vardiyalı gün ölçüye girmiyor', () => {
    const entries = [...history('2026-09-22', 2, 30000), day('2026-09-18', 99999, { open: 1 })];
    assert.equal(baselineFor(entries, d('2026-09-23'))!.dayCount, 2);
    assert.equal(baselineFor(entries, d('2026-09-23'))!.perHour, 30000);
  });

  it('ortanca uç günü yutuyor', () => {
    const entries = [...history('2026-09-22', 5, 30000), day('2026-09-17', 500000)];
    assert.equal(baselineFor(entries, d('2026-09-23'))!.perHour, 30000);
  });

  it('geçmiş hep zararlıysa kâra geçen gün tavan', () => {
    const entries = history('2026-09-22', 3, -1000);
    const today = day('2026-09-23', 20000);
    assert.equal(scoreDay(today, baselineFor(entries, today.date))!.score, 100);
  });
});

describe('günün puanı', () => {
  const past = history('2026-09-22', 6, 30000, 1000);

  it('normal gün 50', () => {
    const today = day('2026-09-23', 30000, { perKm: 1000 });
    assert.equal(scoreDay(today, baselineFor(past, today.date))!.score, 50);
  });

  it('saat 60, km 40 ağırlıkla', () => {
    // saat oranı 1,5; km oranı 1 → 0,6×1,5 + 0,4×1 = 1,3 → 65
    const today = day('2026-09-23', 45000, { perKm: 1000 });
    const s = scoreDay(today, baselineFor(past, today.date))!;
    assert.equal(s.usedKm, true);
    assert.equal(s.score, 65);
  });

  it('km bilinmiyorsa yalnız saat', () => {
    const today = day('2026-09-23', 45000);
    const s = scoreDay(today, baselineFor(past, today.date))!;
    assert.equal(s.usedKm, false);
    assert.equal(s.score, 75);
  });

  it('zarar edilen gün 0, km iyi olsa bile', () => {
    const today = day('2026-09-23', -5000, { perKm: 5000, cash: -100 });
    assert.equal(scoreDay(today, baselineFor(past, today.date))!.score, 0);
  });

  it('ilk gün kendi ölçüsü: 50', () => {
    const first = day('2026-09-23', 45000, { perKm: 1500 });
    const s = scoreDay(first, baselineFor([first], first.date))!;
    assert.equal(s.score, 50);
    assert.equal(s.baseline.dayCount, 0);
    assert.equal(s.baseline.perHour, 45000);
  });

  it('ilk gün zararlıysa 0', () => {
    const first = day('2026-09-23', -3000, { cash: -100 });
    assert.equal(scoreDay(first, null)!.score, 0);
  });

  it('açık vardiyalı gün puanlanmıyor', () => {
    const today = day('2026-09-23', 90000, { open: 1 });
    assert.equal(scoreDay(today, baselineFor(past, today.date)), null);
  });
});

describe('aralığın puanları', () => {
  it('her gün kendi önceki 30 gününe göre, eskiden yeniye', () => {
    const entries = [...history('2026-09-10', 6, 30000), day('2026-09-11', 60000), day('2026-09-12', 30000)];
    const scores = scoreDays(entries, d('2026-09-11'), d('2026-09-12'));
    assert.deepEqual(scores.map((s) => s.date), ['2026-09-11', '2026-09-12']);
    assert.equal(scores[0].score, 100);
    // 12'sinin ölçüsüne 11'i de giriyor: ortanca hâlâ 30000
    assert.equal(scores[1].score, 50);
    assert.equal(averageScore(scores), 75);
    assert.equal(averageScore([]), null);
  });

  it('ilk günden itibaren her gün puanlanıyor', () => {
    // 1'i kendi ölçüsü (50); 2'si 1'ine göre 1,5 kat (75);
    // 3'ü ilk ikisinin ortancasına (37.500) göre 0,4 kat (20).
    const entries = [day('2026-09-01', 30000), day('2026-09-02', 45000), day('2026-09-03', 15000)];
    assert.deepEqual(
      scoreDays(entries, d('2026-09-01'), d('2026-09-03')).map((s) => s.score),
      [50, 75, 20],
    );
  });
});
