import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseWholeKm, toWholePositive } from './whole-number.ts';

describe('parseWholeKm', () => {
  it('tam sayı olduğu gibi okunur', () => {
    assert.equal(parseWholeKm('238'), 238);
    assert.equal(parseWholeKm(' 238 '), 238);
  });

  it('ondalık kilometre sıfırdan uzağa yarım yuvarlanır', () => {
    assert.equal(parseWholeKm('238,5'), 239);
    assert.equal(parseWholeKm('238.5'), 239);
    assert.equal(parseWholeKm('238,4'), 238);
  });

  it('binlik noktalı kilometre okunur', () => {
    assert.equal(parseWholeKm('150.000'), 150000);
    assert.equal(parseWholeKm('1.234.567'), 1234567);
  });

  it('bilinmeyen kilometre null — sıfıra düşmez', () => {
    assert.equal(parseWholeKm(''), null);
    assert.equal(parseWholeKm('   '), null);
    assert.equal(parseWholeKm('abc'), null);
    assert.equal(parseWholeKm('-5'), null);
    assert.equal(parseWholeKm('0'), null);
    // Yuvarlanınca sıfır: bilinmiyor sayılır, "0 km yaptı" değil.
    assert.equal(parseWholeKm('0,4'), null);
  });
});

describe('toWholePositive', () => {
  it('her sonuç tam sayı', () => {
    for (const v of [0.5, 1.49, 238.5, 7499.6, 1e6 + 0.5]) {
      const r = toWholePositive(v);
      assert.ok(r != null && Number.isInteger(r), `${v} → ${r}`);
    }
  });

  it('boş, NaN, sonsuz, sıfır ve negatif null', () => {
    for (const v of [null, undefined, Number.NaN, Infinity, 0, -1, 0.4]) {
      assert.equal(toWholePositive(v), null, String(v));
    }
  });
});
