import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  OTHER_OPTION, VEHICLE_MAKES, kindOf, makesFor, modelYears, modelsFor,
} from './vehicle-catalog.ts';

describe('araç kataloğu', () => {
  it('marka listesi dolu ve tekrarsız', () => {
    assert.ok(VEHICLE_MAKES.length > 20);
    assert.equal(new Set(VEHICLE_MAKES).size, VEHICLE_MAKES.length);
  });

  it('"Diğer" her zaman son sırada — listeye takılan olmasın', () => {
    assert.equal(VEHICLE_MAKES[VEHICLE_MAKES.length - 1], OTHER_OPTION);
  });

  it('bilinen markanın modelleri geliyor ve sonunda "Diğer" var', () => {
    const models = modelsFor('Renault');
    assert.ok(models.includes('Symbol'));
    assert.equal(models[models.length - 1], OTHER_OPTION);
  });

  it('bilinmeyen markada yalnızca serbest giriş kalıyor', () => {
    assert.deepEqual(modelsFor('Bilinmeyen'), [OTHER_OPTION]);
    assert.deepEqual(modelsFor(OTHER_OPTION), [OTHER_OPTION]);
  });

  it('marka seçilmemişse model listesi boş', () => {
    assert.deepEqual(modelsFor(null), []);
  });

  it('her markanın en az bir modeli var', () => {
    for (const make of VEHICLE_MAKES) {
      if (make === OTHER_OPTION) continue;
      assert.ok(modelsFor(make).length > 1, make);
    }
  });

  it('ilk kullanıcıların elle yazdığı araçlar listede', () => {
    for (const model of ['Accent Era', 'i30', 'Getz', 'Kona']) {
      assert.ok(modelsFor('Hyundai').includes(model), model);
    }
    assert.ok(modelsFor('Peugeot').includes('Rifter'));
    assert.ok(modelsFor('Volkswagen').includes('Tiguan'));
    assert.ok(modelsFor('Honda', 'motorcycle').includes('PCX'));
    assert.ok(modelsFor('Arora', 'motorcycle').includes('Beatrix'));
    assert.ok(modelsFor('RKS', 'motorcycle').includes('K-Light'));
  });

  it('motosiklet markaları otomobil listesine karışmıyor', () => {
    assert.ok(!VEHICLE_MAKES.includes('Kuba'));
    assert.ok(makesFor('motorcycle').includes('Kuba'));
    assert.equal(makesFor('motorcycle').at(-1), OTHER_OPTION);
    assert.ok(!modelsFor('Honda').includes('PCX'));
  });

  it('her iki türde de markalar tekrarsız ve modelleri dolu', () => {
    for (const kind of ['car', 'motorcycle'] as const) {
      const makes = makesFor(kind);
      assert.equal(new Set(makes).size, makes.length, kind);
      for (const make of makes) {
        if (make === OTHER_OPTION) continue;
        const models = modelsFor(make, kind);
        assert.ok(models.length > 1, make);
        assert.equal(new Set(models).size, models.length, make);
      }
    }
  });

  it('kayıtlı aracın türü markasından ve modelinden çıkıyor', () => {
    assert.equal(kindOf('Kuba', 'Cita'), 'motorcycle');
    assert.equal(kindOf('Honda', 'PCX'), 'motorcycle');
    assert.equal(kindOf('Honda', 'Civic'), 'car');
    assert.equal(kindOf('Honda', null), 'car');
    assert.equal(kindOf('Bilinmeyen', 'X'), 'car');
    assert.equal(kindOf(null), 'car');
  });

  it('yıl listesi yeniden eskiye, bu yıldan başlıyor', () => {
    const years = modelYears(new Date(2026, 5, 1));
    assert.equal(years[0], '2026');
    assert.equal(years[years.length - 1], '1998');
    assert.ok(years.indexOf('2026') < years.indexOf('2020'));
  });
});
