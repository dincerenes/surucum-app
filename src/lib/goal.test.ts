import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { calculateGoalProgress } from './goal.ts';
import type { Kurus } from './money.ts';

const k = (n: number) => n as Kurus;

describe('hedef ilerlemesi', () => {
  it('hedef yoksa null döner', () => {
    assert.equal(calculateGoalProgress(null, k(50_000)), null);
    assert.equal(calculateGoalProgress(undefined, k(50_000)), null);
  });

  it('sıfır ve negatif hedef yok sayılır', () => {
    assert.equal(calculateGoalProgress(k(0), k(50_000)), null);
    assert.equal(calculateGoalProgress(k(-100), k(50_000)), null);
  });

  it('yarı yol %50 doluluk', () => {
    const p = calculateGoalProgress(k(100_000), k(50_000))!;
    assert.equal(p.ratio, 0.5);
    assert.equal(p.remaining, 50_000);
    assert.equal(p.reached, false);
  });

  it('hedefe ulaşınca kalan sıfır', () => {
    const p = calculateGoalProgress(k(100_000), k(100_000))!;
    assert.equal(p.reached, true);
    assert.equal(p.remaining, 0);
    assert.equal(p.ratio, 1);
  });

  it('hedef AŞILINCA doluluk 1de durur — çubuk taşmaz', () => {
    const p = calculateGoalProgress(k(100_000), k(250_000))!;
    assert.equal(p.ratio, 1);
    assert.equal(p.reached, true);
    assert.equal(p.remaining, 0);
  });

  it('zarar edilen gün SIFIR doluluk gösterir, negatif çubuk değil', () => {
    const p = calculateGoalProgress(k(100_000), k(-40_000))!;
    assert.equal(p.ratio, 0);
    assert.equal(p.reached, false);
    // Kalan, zararı da kapatacak kadar: hedef − (−400 TL)
    assert.equal(p.remaining, 140_000);
  });

  it('sıfır kazançta doluluk sıfır', () => {
    const p = calculateGoalProgress(k(100_000), k(0))!;
    assert.equal(p.ratio, 0);
    assert.equal(p.remaining, 100_000);
  });
});
