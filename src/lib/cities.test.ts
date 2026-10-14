import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CITIES, searchCities } from './cities.ts';

describe('iller', () => {
  it('81 il, tekrarsız', () => {
    assert.equal(CITIES.length, 81);
    assert.equal(new Set(CITIES).size, 81);
  });

  it('Türkçe alfabetik sıralı', () => {
    const sorted = [...CITIES].sort((a, b) => a.localeCompare(b, 'tr'));
    assert.deepEqual(CITIES, sorted);
  });

  it('İstanbul, İzmir, Iğdır listede', () => {
    assert.ok(CITIES.includes('İstanbul'));
    assert.ok(CITIES.includes('İzmir'));
    assert.ok(CITIES.includes('Iğdır'));
  });
});

describe('searchCities', () => {
  it('boş sorgu tüm illeri döndürür', () => {
    assert.deepEqual(searchCities(''), [...CITIES]);
  });

  it('önce baş harfle eşleşenler', () => {
    const result = searchCities('ist');
    assert.equal(result[0], 'İstanbul');
  });

  it('büyük/küçük harf ve Türkçe İ/I duyarsız', () => {
    const result = searchCities('IĞ');
    assert.ok(result.includes('Iğdır'));
  });

  it('tek sonuç döndüren sorgu', () => {
    assert.deepEqual(searchCities('izm'), ['İzmir']);
  });
});
