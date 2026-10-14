import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateFuelCost, calculateFuelVolume } from './fuel-cost.ts';
import { type Kurus, fromLira } from './money.ts';

const k = (lira: number) => fromLira(lira);

describe('calculateFuelCost', () => {
  it('200 km · 7,5 lt/100km · 50 ₺/lt → 750 ₺', () => {
    assert.equal(calculateFuelCost(200, 7500, k(50)), k(750));
  });

  it('aynı tüketim iki günde aynı maliyeti verir', () => {
    // Pazartesi depo doldurdu, salı almadı — yakılan yakıt ikisinde de aynı
    const pazartesi = calculateFuelCost(200, 7500, k(50));
    const sali = calculateFuelCost(200, 7500, k(50));
    assert.equal(pazartesi, sali);
  });

  it('eksik girdi SIFIR döner, uydurulmaz', () => {
    assert.equal(calculateFuelCost(null, 7500, k(50)), 0);
    assert.equal(calculateFuelCost(200, null, k(50)), 0);
    assert.equal(calculateFuelCost(200, 7500, null), 0);
    assert.equal(calculateFuelCost(0, 7500, k(50)), 0);
    assert.equal(calculateFuelCost(200, 0, k(50)), 0);
    assert.equal(calculateFuelCost(200, 7500, 0 as Kurus), 0);
  });

  it('bozuk sayılar sıfıra düşer', () => {
    assert.equal(calculateFuelCost(Number.NaN, 7500, k(50)), 0);
    assert.equal(calculateFuelCost(200, Number.POSITIVE_INFINITY, k(50)), 0);
    assert.equal(calculateFuelCost(-200, 7500, k(50)), 0);
  });

  it('küsuratlı değerler tam sayı kuruşa yuvarlanır', () => {
    // 187 km × 6800 ml × 4735 kuruş / 100000 = 60.210,26 → 60.210 kuruş
    const r = calculateFuelCost(187, 6800, 4735 as Kurus);
    assert.ok(Number.isInteger(r));
    assert.equal(r, 60210);
  });

  it('LPG gibi düşük fiyatlı yakıt da doğru', () => {
    // 300 km · 12 lt/100km · 22 ₺/lt = 36 lt × 22 = 792 ₺
    assert.equal(calculateFuelCost(300, 12000, k(22)), k(792));
  });

  it('uzun mesafede taşma olmuyor', () => {
    const r = calculateFuelCost(2000, 20000, k(100));
    assert.ok(Number.isSafeInteger(r));
    assert.equal(r, k(40000)); // 400 lt × 100 ₺
  });
});

describe('calculateFuelVolume', () => {
  it('200 km · 7,5 lt/100km → 15 lt', () => {
    assert.equal(calculateFuelVolume(200, 7500), 15000);
  });

  it('eksik girdi null döner — sıfır değil', () => {
    assert.equal(calculateFuelVolume(null, 7500), null);
    assert.equal(calculateFuelVolume(200, null), null);
    assert.equal(calculateFuelVolume(0, 7500), null);
  });
});
