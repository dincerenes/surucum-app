import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateRideAmounts } from './ride.ts';
import { type BasisPoints, type Kurus, fromLira, percentToBps } from './money.ts';

const k = (lira: number) => fromLira(lira);
const pct = (p: number) => percentToBps(p);

describe('calculateRideAmounts', () => {
  it('orandan komisyon keser, net brütten komisyon çıkar', () => {
    const r = calculateRideAmounts({
      grossAmountKurus: k(240), commissionBps: pct(20),
    });
    assert.equal(r.grossAmountKurus, k(240));
    assert.equal(r.commissionKurus, k(48));
    assert.equal(r.netAmountKurus, k(192));
    assert.equal(r.commissionBps, pct(20));
  });

  it('komisyonsuz kaynakta kesinti yapılmaz', () => {
    const r = calculateRideAmounts({
      grossAmountKurus: k(520), commissionBps: pct(0),
    });
    assert.equal(r.commissionKurus, 0);
    assert.equal(r.netAmountKurus, k(520));
  });

  it('küsuratlı komisyon tam sayı kuruşa yuvarlanır', () => {
    // 187,50 ₺ üzerinden %17,5 = 32,8125 ₺ → 3281,25 kuruş → 3281
    const r = calculateRideAmounts({
      grossAmountKurus: k(187.5), commissionBps: pct(17.5),
    });
    assert.equal(r.commissionKurus, 3281);
    assert.equal(r.netAmountKurus, 18750 - 3281);
    assert.ok(Number.isInteger(r.commissionKurus));
    assert.ok(Number.isInteger(r.netAmountKurus));
  });

  it('sürücünün girdiği kesinti oranı ezer', () => {
    const r = calculateRideAmounts({
      grossAmountKurus: k(2400), commissionBps: pct(20),
      commissionOverrideKurus: k(600),
    });
    assert.equal(r.commissionKurus, k(600));
    assert.equal(r.netAmountKurus, k(1800));
    // Oran geriye hesaplanır: 600/2400 = %25
    assert.equal(r.commissionBps, pct(25));
  });

  it('girilen kesinti brütü aşarsa brüte kırpılır — net negatif olmaz', () => {
    const r = calculateRideAmounts({
      grossAmountKurus: k(100), commissionBps: pct(20),
      commissionOverrideKurus: k(150),
    });
    assert.equal(r.commissionKurus, k(100));
    assert.equal(r.netAmountKurus, 0);
  });

  it('bahşiş komisyona girmez ve net hesabına eklenmez', () => {
    const r = calculateRideAmounts({
      grossAmountKurus: k(200), commissionBps: pct(25), tipKurus: k(50),
    });
    assert.equal(r.commissionKurus, k(50));   // yalnız brütten
    assert.equal(r.netAmountKurus, k(150));   // bahşiş dahil değil
    assert.equal(r.tipKurus, k(50));
  });

  it('sıfır tutarlı sefer patlamaz — iptal edilen sefer kaydı', () => {
    const r = calculateRideAmounts({
      grossAmountKurus: 0 as Kurus, commissionBps: pct(20),
      commissionOverrideKurus: 0 as Kurus,
    });
    assert.equal(r.commissionKurus, 0);
    assert.equal(r.netAmountKurus, 0);
    assert.equal(r.commissionBps, 0);
  });

  it('negatif tutar reddedilir', () => {
    assert.throws(() => calculateRideAmounts({
      grossAmountKurus: -100 as Kurus, commissionBps: pct(20),
    }), RangeError);
    assert.throws(() => calculateRideAmounts({
      grossAmountKurus: k(100), commissionBps: pct(20), tipKurus: -1 as Kurus,
    }), RangeError);
    assert.throws(() => calculateRideAmounts({
      grossAmountKurus: k(100), commissionBps: pct(20),
      commissionOverrideKurus: -1 as Kurus,
    }), RangeError);
  });

  it('negatif oran kesinti yapmaz — bozuk ayar parayı büyütemez', () => {
    const r = calculateRideAmounts({
      grossAmountKurus: k(100), commissionBps: -500 as BasisPoints,
    });
    assert.equal(r.commissionKurus, 0);
    assert.equal(r.netAmountKurus, k(100));
  });

  it('her dönen tutar tam sayı kalır', () => {
    for (const lira of [1, 7.77, 33.33, 187.5, 999.99, 12345.67]) {
      for (const p of [0, 7.5, 17.5, 20, 33.33]) {
        const r = calculateRideAmounts({
          grossAmountKurus: k(lira), commissionBps: pct(p),
        });
        for (const v of Object.values(r)) assert.ok(Number.isInteger(v), `${lira}/${p}`);
      }
    }
  });
});

describe('saklanan oran bulut kısıtına uyar', () => {
  it('aralık dışı oran 0–10000 arasına sıkıştırılır', () => {
    // Bulutta check (commission_bps between 0 and 10000) var, SQLite'ta yok.
    const over = calculateRideAmounts({
      grossAmountKurus: k(100), commissionBps: 15000 as BasisPoints,
    });
    assert.equal(over.commissionBps, 10000);

    const under = calculateRideAmounts({
      grossAmountKurus: k(100), commissionBps: -500 as BasisPoints,
    });
    assert.equal(under.commissionBps, 0);
  });

  it('kesinti brüte eşitken oran tam 10000 olur, aşmaz', () => {
    const r = calculateRideAmounts({
      grossAmountKurus: k(100), commissionBps: pct(20),
      commissionOverrideKurus: k(500),
    });
    assert.equal(r.commissionKurus, k(100));
    assert.equal(r.commissionBps, 10000);
  });

  it('her yolda dönen oran kısıt aralığında kalır', () => {
    for (const gross of [1, 100, 18750, 999999]) {
      for (const bps of [-10000, -1, 0, 1, 2000, 9999, 10000, 10001, 99999]) {
        for (const ovr of [undefined, 0, 1, 50, gross, gross * 2]) {
          const r = calculateRideAmounts({
            grossAmountKurus: gross as Kurus,
            commissionBps: bps as BasisPoints,
            commissionOverrideKurus: ovr as Kurus | undefined,
          });
          assert.ok(r.commissionBps >= 0 && r.commissionBps <= 10000,
            `gross=${gross} bps=${bps} ovr=${ovr} → ${r.commissionBps}`);
          assert.ok(Number.isInteger(r.commissionBps));
        }
      }
    }
  });
});
