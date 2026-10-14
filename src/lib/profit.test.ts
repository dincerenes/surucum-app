import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_WEAR_PER_KM, defaultWearPerKm } from '../db/schema/_shared.ts';
import { type Kurus, ZERO, asKurus, fromLira } from './money.ts';
import { calculateProfit, calculateWearShare } from './profit.ts';

const k = (lira: number): Kurus => fromLira(lira);

describe('calculateWearShare', () => {
  it('km × kilometre başına kuruş', () => {
    assert.equal(calculateWearShare(120, asKurus(300)), 36_000); // 360,00 TL
  });

  it('kilometre bilinmiyorsa sıfır — uydurmaz', () => {
    assert.equal(calculateWearShare(null, asKurus(300)), ZERO);
    assert.equal(calculateWearShare(undefined, asKurus(300)), ZERO);
  });

  it('yıpranma payı sıfır olan araçta sıfır', () => {
    assert.equal(calculateWearShare(400, ZERO), ZERO);
  });

  it('anlamsız kilometre sıfır döner, patlamaz', () => {
    assert.equal(calculateWearShare(0, asKurus(300)), ZERO);
    assert.equal(calculateWearShare(-50, asKurus(300)), ZERO);
    assert.equal(calculateWearShare(NaN, asKurus(300)), ZERO);
    assert.equal(calculateWearShare(Infinity, asKurus(300)), ZERO);
  });

  it('küsuratlı kilometre tam sayı kuruşa yuvarlanır', () => {
    const r = calculateWearShare(87.3, asKurus(300));
    assert.equal(r, 26_190);
    assert.ok(Number.isInteger(r));
  });
});

describe('sahiplik biçimine göre yıpranma', () => {
  it('kiralık araçta ve işveren aracında sıfırdır', () => {
    // Aracın değer kaybı sürücünün cebinden çıkmıyor; o maliyet kira
    // bedeli olarak zaten sabit giderlerde sayılıyor. Sıfırlamazsak
    // aynı maliyeti iki kez düşeriz.
    assert.equal(defaultWearPerKm('rented_vehicle'), ZERO);
    assert.equal(defaultWearPerKm('employer'), ZERO);
  });

  it('kendi aracında ve kiralık plakada tam işler', () => {
    assert.ok(defaultWearPerKm('owned') > 0);
    assert.equal(defaultWearPerKm('rented_plate'), defaultWearPerKm('owned'));
  });

  it('her sahiplik biçiminin bir karşılığı var', () => {
    for (const v of Object.values(DEFAULT_WEAR_PER_KM)) {
      assert.ok(Number.isInteger(v) && v >= 0);
    }
  });
});

describe('calculateProfit — üç satır', () => {
  it('ciro, cebe kalan ve gerçek kâr birbirini tutar', () => {
    const p = calculateProfit({
      grossAmounts: [k(180), k(240), k(95.5)],
      commissionAmounts: [k(45), k(60), k(23.88)],
      tips: [k(20)],
      fuelAmounts: [k(850)],
      expenseAmounts: [k(120), k(45)],
      fixedShare: k(400),
      distanceKm: 210,
      wearPerKmKurus: asKurus(300),
    });

    // (1) Ciro = seferler + bahşiş
    assert.equal(p.revenue, k(180) + k(240) + k(95.5) + k(20));

    // (2) Cebe kalan = ciro − komisyon − yakıt − gider
    assert.equal(
      p.cashProfit,
      p.revenue - p.commission - p.fuelPaid - p.expensesPaid,
    );

    // (3) Gerçek kâr = cebe kalan − sabit pay − yıpranma
    assert.equal(p.trueProfit, p.cashProfit - p.fixedShare - p.wearShare);

    // Gerçek kâr her zaman cebe kalandan küçük ya da eşit.
    assert.ok(p.trueProfit <= p.cashProfit);
    assert.ok(p.cashProfit <= p.revenue);
  });

  it('bahşiş ciroya girer ama komisyona girmez', () => {
    const withTip = calculateProfit({
      grossAmounts: [k(100)],
      commissionAmounts: [k(25)],
      tips: [k(30)],
    });
    const withoutTip = calculateProfit({
      grossAmounts: [k(100)],
      commissionAmounts: [k(25)],
    });

    assert.equal(withTip.revenue - withoutTip.revenue, k(30));
    assert.equal(withTip.commission, withoutTip.commission);
    assert.equal(withTip.cashProfit - withoutTip.cashProfit, k(30));
  });

  it('yıpranma ve sabit pay yoksa cebe kalan ile gerçek kâr eşittir', () => {
    // İşveren aracıyla çalışan sürücünün durumu.
    const p = calculateProfit({
      grossAmounts: [k(500)],
      commissionAmounts: [k(125)],
      distanceKm: 300,
      wearPerKmKurus: ZERO,
    });
    assert.equal(p.wearShare, ZERO);
    assert.equal(p.trueProfit, p.cashProfit);
  });

  it('boş gün her satırda sıfır verir, patlamaz', () => {
    const p = calculateProfit({ grossAmounts: [], commissionAmounts: [] });
    assert.equal(p.revenue, ZERO);
    assert.equal(p.cashProfit, ZERO);
    assert.equal(p.trueProfit, ZERO);
  });

  it('zarar eden gün eksi gerçek kâr verir, sıfıra kırpılmaz', () => {
    // Az iş çıkan bir gün: sabit giderler ciroyu yiyor.
    const p = calculateProfit({
      grossAmounts: [k(300)],
      commissionAmounts: [k(75)],
      fuelAmounts: [k(400)],
      fixedShare: k(500),
      distanceKm: 90,
      wearPerKmKurus: asKurus(300),
    });
    assert.ok(p.trueProfit < 0);
    // Sürücü "bugün 300 lira kazandım" sanıyor; gerçekte zarar etmiş.
    assert.ok(p.revenue > 0);
  });

  it('tüm sonuçlar tam sayı kuruş kalır', () => {
    const p = calculateProfit({
      grossAmounts: [k(33.33), k(66.67)],
      commissionAmounts: [k(8.33), k(16.67)],
      fixedShare: k(123.45),
      distanceKm: 77.7,
      wearPerKmKurus: asKurus(300),
    });
    for (const [key, value] of Object.entries(p)) {
      if (typeof value === 'number') {
        assert.ok(Number.isInteger(value), `${key} tam sayı değil: ${value}`);
      }
    }
  });

  it('tahmini kilometre işaretlenir', () => {
    const p = calculateProfit({
      grossAmounts: [k(100)],
      commissionAmounts: [k(25)],
      distanceKm: 150,
      wearPerKmKurus: asKurus(300),
      isDistanceEstimated: true,
    });
    assert.equal(p.isDistanceEstimated, true);
    assert.ok(p.wearShare > 0); // hesap yine yapılıyor, ama damgalı
  });
});

describe('gerçekçi vardiya', () => {
  it('kiralık plakalı sürücünün günü', () => {
    // 14 sefer, ortalama 165 TL brüt, %25 komisyon, 280 km,
    // 1.100 TL yakıt, 150 TL yemek, plaka kirasının günlük payı 1.200 TL.
    const gross = Array.from({ length: 14 }, () => k(165));
    const commission = Array.from({ length: 14 }, () => k(41.25));

    const p = calculateProfit({
      grossAmounts: gross,
      commissionAmounts: commission,
      fuelAmounts: [k(1100)],
      expenseAmounts: [k(150)],
      fixedShare: k(1200),
      distanceKm: 280,
      wearPerKmKurus: defaultWearPerKm('rented_plate'),
    });

    assert.equal(p.revenue, k(2310));      // 14 × 165
    assert.equal(p.commission, k(577.5));
    assert.equal(p.cashProfit, k(482.5));  // 2310 − 577,5 − 1100 − 150
    assert.equal(p.wearShare, k(700));     // 280 km × 2,50

    // Cebinde 482,50 lira var ve kazandığını sanıyor.
    // Gerçekte 1.417,50 lira ZARAR etmiş.
    assert.equal(p.trueProfit, k(-1417.5));
    assert.ok(p.cashProfit > 0 && p.trueProfit < 0);
  });
});
