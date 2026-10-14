import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isKnownUnitPrice, pickPrimaryFuelType } from './fuel-type-pick.ts';

const row = (id: string, o: Partial<{ isPrimary: boolean; createdAt: number; deletedAt: number | null }> = {}) => ({
  id, isPrimary: false, createdAt: 1, deletedAt: null, ...o,
});

describe('pickPrimaryFuelType', () => {
  it('silinmiş birincil ile canlı birincil varsa CANLI olan seçilir', () => {
    const picked = pickPrimaryFuelType([
      row('lpg-eski', { isPrimary: true, createdAt: 1, deletedAt: 2 }),
      row('benzin', { isPrimary: true, createdAt: 3 }),
    ]);
    assert.equal(picked?.id, 'benzin');
  });

  it('hepsi silinmişse null — silinmiş satırın değeri gösterilmez', () => {
    assert.equal(pickPrimaryFuelType([row('a', { isPrimary: true, deletedAt: 5 })]), null);
    assert.equal(pickPrimaryFuelType([]), null);
  });

  it('iki canlı birincilde en eski, eşitlikte kimliği küçük olan', () => {
    assert.equal(pickPrimaryFuelType([
      row('b', { isPrimary: true, createdAt: 5 }),
      row('a', { isPrimary: true, createdAt: 9 }),
    ])?.id, 'b');
    assert.equal(pickPrimaryFuelType([
      row('z', { isPrimary: true, createdAt: 5 }),
      row('c', { isPrimary: true, createdAt: 5 }),
    ])?.id, 'c');
  });

  it('birincil ikinci sırada olsa da seçilir', () => {
    assert.equal(pickPrimaryFuelType([
      row('benzin', { createdAt: 1 }),
      row('lpg', { isPrimary: true, createdAt: 2 }),
    ])?.id, 'lpg');
  });

  it('birincil yoksa en eski tip', () => {
    assert.equal(pickPrimaryFuelType([row('y', { createdAt: 4 }), row('x', { createdAt: 2 })])?.id, 'x');
  });
});

describe('isKnownUnitPrice', () => {
  it('yalnızca pozitif, sonlu fiyat hatırlanır', () => {
    assert.equal(isKnownUnitPrice(4550), true);
    for (const p of [0, -4000, null, undefined, Number.NaN, Infinity]) {
      assert.equal(isKnownUnitPrice(p), false, String(p));
    }
  });
});
