import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { upperTr } from './text.ts';

describe('upperTr', () => {
  it('noktalı i büyük İ olur, noktasız ı büyük I', () => {
    assert.equal(upperTr('Aracın kilometresi'), 'ARACIN KİLOMETRESİ');
    assert.equal(upperTr('22 Nisan 2026'), '22 NİSAN 2026');
    assert.equal(upperTr('Kaç km yaptın?'), 'KAÇ KM YAPTIN?');
    assert.equal(upperTr('Şubat · Çarşamba · Öğle · Ümit'), 'ŞUBAT · ÇARŞAMBA · ÖĞLE · ÜMİT');
  });
});
