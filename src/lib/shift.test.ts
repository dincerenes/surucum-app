import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  STALE_SHIFT_HOURS, calculateShiftStats, canCalculateWear, earningsPerHour,
  earningsPerKm, earningsPerRide, formatDuration, isShiftOpen, isShiftStale, normalizeDistance,
  resolveShiftDuration,
} from './shift.ts';
import { type Kurus, fromLira } from './money.ts';

const k = (lira: number) => fromLira(lira);
const H = 3_600_000;
const M = 60_000;
const T0 = 1_787_700_000_000; // sabit bir damga — Date.now() kullanılmıyor

const timing = (o: Partial<Parameters<typeof resolveShiftDuration>[0]> = {}) => ({
  startedAt: T0, endedAt: null, workedMinutes: null, distanceKm: null, ...o,
});

describe('resolveShiftDuration', () => {
  it('sürücünün yazdığı süre damga farkını EZER', () => {
    // Damgalar 30 saat diyor ama sürücü 8 saat çalıştığını yazmış
    const d = resolveShiftDuration(
      timing({ endedAt: T0 + 30 * H, workedMinutes: 480 }), T0 + 31 * H,
    );
    assert.equal(d.minutes, 480);
    assert.equal(d.isEstimated, false);
  });

  it('kapalı vardiyada damga farkı kullanılır', () => {
    const d = resolveShiftDuration(timing({ endedAt: T0 + 7 * H + 42 * M }), T0 + 9 * H);
    assert.equal(d.minutes, 7 * 60 + 42);
    assert.equal(d.isEstimated, true);
  });

  it('açık vardiyanın süresi YOK — canlı sayaç yok, saat bitince soruluyor', () => {
    const d = resolveShiftDuration(timing(), T0 + 3 * H + 15 * M);
    assert.equal(d.minutes, 0);
  });

  it('sıfır ve negatif yazılan süre yok sayılır, damgaya düşülür', () => {
    for (const bad of [0, -60, Number.NaN, Number.POSITIVE_INFINITY]) {
      const d = resolveShiftDuration(
        timing({ endedAt: T0 + 2 * H, workedMinutes: bad }), T0 + 3 * H,
      );
      assert.equal(d.minutes, 120, `workedMinutes=${bad}`);
      assert.equal(d.isEstimated, true);
    }
  });

  it('geriye giden damga negatif süre üretmez', () => {
    const d = resolveShiftDuration(timing({ endedAt: T0 - 5 * H }), T0);
    assert.equal(d.minutes, 0);
  });
});

describe('isShiftStale', () => {
  it('açık ve eşiği aşmış vardiya bayattır', () => {
    assert.equal(isShiftStale(timing(), T0 + (STALE_SHIFT_HOURS + 1) * H), true);
  });

  it('eşiğin altındaki açık vardiya bayat değildir', () => {
    assert.equal(isShiftStale(timing(), T0 + (STALE_SHIFT_HOURS - 1) * H), false);
  });

  it('tam eşikte henüz bayat değil', () => {
    assert.equal(isShiftStale(timing(), T0 + STALE_SHIFT_HOURS * H), false);
  });

  it('kapalı vardiya ne kadar uzun olursa olsun bayat değildir', () => {
    const closed = timing({ endedAt: T0 + 40 * H });
    assert.equal(isShiftStale(closed, T0 + 500 * H), false);
  });

  it('isShiftOpen endedAt boşluğuna bakar', () => {
    assert.equal(isShiftOpen(timing()), true);
    assert.equal(isShiftOpen(timing({ endedAt: T0 + H })), false);
  });
});

describe('türetilmiş oranlar', () => {
  it('saat başına kazanç', () => {
    assert.equal(earningsPerHour(k(2687.5), 462), k(349.03));
  });

  it('kilometre başına kazanç', () => {
    assert.equal(earningsPerKm(k(2687.5), 238), k(11.29));
  });

  it('sefer başına kazanç', () => {
    assert.equal(earningsPerRide(k(4180), 14), k(298.57));
  });

  it('payda yoksa null döner — SIFIR DEĞİL', () => {
    assert.equal(earningsPerHour(k(100), null), null);
    assert.equal(earningsPerHour(k(100), 0), null);
    assert.equal(earningsPerKm(k(100), null), null);
    assert.equal(earningsPerKm(k(100), 0), null);
    assert.equal(earningsPerRide(k(100), 0), null);
    assert.equal(earningsPerHour(k(100), Number.NaN), null);
  });

  it('negatif kazanç oranı da negatif döner — zarar gizlenmez', () => {
    const r = earningsPerHour(-100_000 as Kurus, 120);
    assert.equal(r, -50_000);
  });

  it('oranlar tam sayı kuruş kalır', () => {
    for (const m of [1, 7, 33, 462, 1000]) {
      assert.ok(Number.isInteger(earningsPerHour(k(2687.5), m)!));
    }
  });
});

describe('normalizeDistance / canCalculateWear', () => {
  it('bozuk kilometre null olur, sıfır olmaz', () => {
    for (const bad of [null, undefined, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(normalizeDistance(bad), null, `${bad}`);
    }
  });

  it('geçerli kilometre korunur', () => {
    assert.equal(normalizeDistance(238), 238);
    assert.equal(normalizeDistance(0.5), 0.5);
  });

  it('kilometre yoksa yıpranma hesaplanamaz', () => {
    assert.equal(canCalculateWear({ distanceKm: null }), false);
    assert.equal(canCalculateWear({ distanceKm: 0 }), false);
    assert.equal(canCalculateWear({ distanceKm: 238 }), true);
  });
});

describe('calculateShiftStats', () => {
  it('gerçek bir vardiyanın türetilmiş sayıları', () => {
    const s = calculateShiftStats(
      timing({ endedAt: T0 + 7 * H + 42 * M, distanceKm: 238 }),
      k(2687.5), 14, T0 + 8 * H,
    );
    assert.equal(s.durationMinutes, 462);
    assert.equal(s.isDurationEstimated, true);
    assert.equal(s.distanceKm, 238);
    assert.equal(s.rideCount, 14);
    assert.equal(s.perHour, k(349.03));
    assert.equal(s.perKm, k(11.29));
    assert.equal(s.perRide, k(191.96));
  });

  it('kilometre girilmemişse TL/km null, diğerleri çalışır', () => {
    const s = calculateShiftStats(
      timing({ endedAt: T0 + 4 * H }), k(1000), 5, T0 + 5 * H,
    );
    assert.equal(s.perKm, null);
    assert.equal(s.distanceKm, null);
    assert.ok(s.perHour !== null);
    assert.ok(s.perRide !== null);
  });

  it('hiç sefer yoksa sefer başı null — sıfıra bölme yok', () => {
    const s = calculateShiftStats(timing(), k(0) as Kurus, 0, T0 + H);
    assert.equal(s.perRide, null);
  });
});

describe('formatDuration', () => {
  it('saat ve dakika', () => {
    assert.equal(formatDuration(370), '6 sa 10 dk');
    assert.equal(formatDuration(45), '45 dk');
    assert.equal(formatDuration(120), '2 sa');
    assert.equal(formatDuration(0), '0 dk');
    assert.equal(formatDuration(-5), '0 dk');
    assert.equal(formatDuration(Number.NaN), '0 dk');
  });
});
