import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type BusinessDate, addDays } from './business-date.ts';
import type { Kurus } from './money.ts';
import {
  PACE_MIN_SHIFTS, type ShiftGross, paceBaseline, paceCaption, pacePercent, shiftPace,
} from './pace.ts';

const d = (s: string) => s as BusinessDate;
const k = (n: number) => n as Kurus;
const TODAY = d('2026-10-02');

function shift(daysAgo: number, gross: number): ShiftGross {
  return { date: addDays(TODAY, -daysAgo), gross: k(gross) };
}

describe('normal vardiya', () => {
  it('en az üç vardiya ister — azıyla ölçü yok', () => {
    assert.equal(PACE_MIN_SHIFTS, 3);
    assert.equal(paceBaseline([shift(1, 200_000), shift(2, 220_000)], TODAY), null);
    assert.equal(paceBaseline([], TODAY), null);
  });

  it('ortanca alınıyor: tek bir bayram vardiyası normali kaydırmıyor', () => {
    const shifts = [shift(1, 200_000), shift(2, 210_000), shift(3, 900_000)];
    assert.equal(paceBaseline(shifts, TODAY), 210_000);
  });

  it('çift sayıda vardiyada iki ortanın ortalaması, tam kuruşa yuvarlanmış', () => {
    const shifts = [shift(1, 100_001), shift(2, 100_000), shift(3, 50_000), shift(4, 300_000)];
    assert.equal(paceBaseline(shifts, TODAY), 100_001);
  });

  it('30 günden eski vardiya pencereye girmiyor, 30. gün giriyor', () => {
    const shifts = [shift(1, 100_000), shift(2, 100_000), shift(31, 100_000)];
    assert.equal(paceBaseline(shifts, TODAY), null);
    assert.equal(paceBaseline([...shifts, shift(30, 100_000)], TODAY), 100_000);
  });

  it('aynı gün önce kapanan vardiya sayılıyor, gelecekteki sayılmıyor', () => {
    const shifts = [shift(0, 100_000), shift(1, 100_000), shift(-1, 100_000)];
    assert.equal(paceBaseline(shifts, TODAY), null);
    assert.equal(paceBaseline([...shifts, shift(2, 100_000)], TODAY), 100_000);
  });

  it('cirosu olmayan vardiya sayılmıyor', () => {
    const shifts = [shift(1, 0), shift(2, 100_000), shift(3, 100_000)];
    assert.equal(paceBaseline(shifts, TODAY), null);
  });
});

describe('vardiyanın normaline göre yeri', () => {
  it('ölçü yoksa halka yok', () => {
    assert.equal(shiftPace(k(50_000), null), null);
    assert.equal(shiftPace(k(50_000), k(0)), null);
  });

  it('dolgu 1 ile sınırlı, oran sınırsız', () => {
    const half = shiftPace(k(100_000), k(200_000))!;
    assert.equal(half.progress, 0.5);
    assert.equal(half.reached, false);

    const over = shiftPace(k(300_000), k(200_000))!;
    assert.equal(over.ratio, 1.5);
    assert.equal(over.progress, 1);
    assert.equal(over.reached, true);
  });

  it('boş vardiya sıfırda', () => {
    const empty = shiftPace(k(0), k(200_000))!;
    assert.equal(empty.progress, 0);
    assert.equal(empty.reached, false);
  });

  it('yüzde aşağı yuvarlanıyor: normale varmadan %100 yazmıyor', () => {
    assert.equal(pacePercent(shiftPace(k(199_900), k(200_000))!), '%99');
    assert.equal(pacePercent(shiftPace(k(116_000), k(200_000))!), '%58');
  });

  it('açıklama: önce normalin tutarı, ulaşınca ve geçince başka söz', () => {
    assert.equal(paceCaption(shiftPace(k(100_000), k(215_000))!), 'normal vardiyan 2.150 ₺');
    assert.equal(paceCaption(shiftPace(k(215_000), k(215_000))!), 'normal vardiyana ulaştın');
    assert.equal(paceCaption(shiftPace(k(215_100), k(215_000))!), 'normal vardiyanı geçtin');
  });
});
