/**
 * Yıpranma girdileri — aracın katsayısı sürücünün bakım, lastik ve değer
 * cevaplarından hesaplanıyor ve girdi değişince yeniden hesaplanıyor.
 *
 * Gerçek repo fonksiyonları ve gerçek migration'lar, node:sqlite üzerinde.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  createVehicle, endShift, getShift, getVehicle, startShift, updateVehicle,
} from '@/db/repo';
import type { Kurus } from '@/lib/money';
import { resetTestDb } from '../../../tools/test-db.ts';

const U = '0199a000-0000-7000-8000-00000000000a';
const T0 = new Date(2026, 8, 18, 12, 0).getTime();
const TL = (n: number) => (n * 100) as Kurus;

const EXAMPLE = {
  maintenanceIntervalKm: 10_000, maintenanceCostKurus: TL(8_000),
  tireIntervalKm: 40_000, tireCostKurus: TL(16_000),
  marketValueKurus: TL(900_000),
};

describe('yıpranma girdileri', () => {
  beforeEach(() => resetTestDb());

  it('kurulumdaki cevaplar katsayıya dönüşür ve saklanır', () => {
    const v = createVehicle(U, {
      label: 'Fiat Egea', ownership: 'owned', fuelTypes: ['gasoline'],
      transmission: 'manual', hasAccidentRecord: false, ...EXAMPLE,
    }, T0);
    assert.equal(v.wearPerKmKurus, 80);
    assert.equal(v.transmission, 'manual');
    assert.equal(v.hasAccidentRecord, false);
    assert.equal(v.marketValueKurus, TL(900_000));
  });

  it('cevapsız araç varsayılan katsayıyı alır', () => {
    const v = createVehicle(U, { label: 'Araç', ownership: 'owned', fuelTypes: ['gasoline'] }, T0);
    assert.equal(v.wearPerKmKurus, 100);
    assert.equal(v.hasAccidentRecord, null);
  });

  it('yalnızca adı değişen aracın katsayısı değişmez', () => {
    const v = createVehicle(U, {
      label: 'Araç', ownership: 'owned', fuelTypes: ['gasoline'], ...EXAMPLE,
    }, T0);
    updateVehicle(U, v.id, { label: 'Yeni ad' }, T0 + 1);
    assert.equal(getVehicle(U, v.id)?.wearPerKmKurus, 80);
  });

  it('girdi değişince katsayı yeniden hesaplanır, geçmiş vardiya eski katsayıda kalır', () => {
    const v = createVehicle(U, { label: 'Araç', ownership: 'owned', fuelTypes: ['gasoline'] }, T0);
    const s = startShift(U, v.id, 4, T0);
    endShift(U, s.id, { distanceKm: 100 }, T0 + 3_600_000);

    updateVehicle(U, v.id, EXAMPLE, T0 + 7_200_000);

    assert.equal(getVehicle(U, v.id)?.wearPerKmKurus, 80);
    const past = getShift(U, s.id);
    assert.equal(past?.wearPerKmKurus ?? getVehicle(U, v.id)?.wearPerKmKurus, 100);
  });

  it('kiralık araçta girilen kalemler sayılmaz', () => {
    const v = createVehicle(U, {
      label: 'Kiralık', ownership: 'rented_vehicle', fuelTypes: ['diesel'], ...EXAMPLE,
    }, T0);
    assert.equal(v.wearPerKmKurus, 0);
  });
});
