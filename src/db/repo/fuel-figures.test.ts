/**
 * Aracın "son bilinen" yakıt değerleri — vardiya sonu ön dolgusu.
 *
 * Sürücü çoğu gün ön dolguyu onaylayıp geçiyor; yanlış satırdan gelen
 * bir tüketim ya da fiyat, onaylandığı anda o günün yakıt maliyetine
 * kopyalanıyor. Buradaki vakalar gerçek repo fonksiyonlarıyla, gerçek
 * migration'ların üzerinde koşuyor.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  addFuelLog, createVehicle, endShift, getKnownFuelFigures, getShift, listVehicleFuelTypes,
  rememberStatedFuelFigures, setVehicleFuelTypes, startShift, updateShiftTotals,
} from '@/db/repo';
import type { Kurus } from '@/lib/money';
import { rawTestDb, resetTestDb } from '../../../tools/test-db.ts';

const U = '0199a000-0000-7000-8000-00000000000a';
const T0 = new Date(2026, 8, 18, 12, 0).getTime();
const k = (n: number) => n as Kurus;

function fuelRows(vehicleId: string) {
  return rawTestDb().prepare(`SELECT id, fuel_type, is_primary, deleted_at,
    avg_consumption_per_100km AS c, last_unit_price_kurus AS p
    FROM vehicle_fuel_types WHERE vehicle_id = ? ORDER BY created_at, id`)
    .all(vehicleId).map((r) => ({ ...r }));
}

describe('yakıt tipi değişince ön dolgu', () => {
  beforeEach(() => resetTestDb());

  function lpgVehicle() {
    const v = createVehicle(U, { label: 'Araç', ownership: 'owned', fuelTypes: ['lpg'] }, T0);
    rememberStatedFuelFigures(U, v.id, 9000, k(1800), T0 + 1);
    return v;
  }

  it('LPG → benzin: ön dolgu silinmiş LPG satırından GELMEZ', () => {
    const v = lpgVehicle();
    setVehicleFuelTypes(U, v.id, ['gasoline'], T0 + 2);

    assert.deepEqual(getKnownFuelFigures(U, v.id), {
      consumptionPer100Km: null, unitPriceKurus: null, isMeasured: false,
    });
    const lpg = fuelRows(v.id).find((r) => r.fuel_type === 'lpg');
    assert.equal(lpg?.is_primary, 0, 'silinen satır birincil kalmamalı');
    assert.ok(lpg?.deleted_at != null);

    const op = rawTestDb().prepare(
      'SELECT operation FROM outbox WHERE row_id = ?',
    ).get(lpg?.id as string);
    assert.equal(op?.operation, 'delete');
  });

  it('benzine geçmiş araçta yeni beyan CANLI benzin satırına yazılır', () => {
    const v = lpgVehicle();
    setVehicleFuelTypes(U, v.id, ['gasoline'], T0 + 2);
    rememberStatedFuelFigures(U, v.id, 7500, k(4550), T0 + 3);

    const rows = fuelRows(v.id);
    assert.deepEqual(rows.map((r) => [r.fuel_type, r.deleted_at == null, r.c, r.p]), [
      ['lpg', false, 9000, 1800],
      ['gasoline', true, 7500, 4550],
    ]);
    assert.equal(getKnownFuelFigures(U, v.id).consumptionPer100Km, 7500);
  });

  it('LPG → benzin → LPG: silinen satır DİRİLİR, değerleri geri gelir, yineleme olmaz', () => {
    const v = lpgVehicle();
    setVehicleFuelTypes(U, v.id, ['gasoline'], T0 + 2);
    setVehicleFuelTypes(U, v.id, ['lpg'], T0 + 3);

    const rows = fuelRows(v.id);
    assert.equal(rows.filter((r) => r.fuel_type === 'lpg').length, 1, 'yeni LPG satırı açılmamalı');
    const alive = rows.filter((r) => r.deleted_at == null);
    assert.deepEqual(alive.map((r) => [r.fuel_type, r.is_primary, r.c, r.p]), [
      ['lpg', 1, 9000, 1800],
    ]);
    assert.deepEqual(getKnownFuelFigures(U, v.id), {
      consumptionPer100Km: 9000, unitPriceKurus: 1800, isMeasured: false,
    });

    // Dirilen satır buluta da gitmeli; yoksa bulutta silinmiş kalır.
    const q = rawTestDb().prepare('SELECT operation FROM outbox WHERE row_id = ?')
      .get(alive[0].id as string);
    assert.equal(q?.operation, 'upsert');
  });

  it('araçta her zaman tek canlı birincil var', () => {
    const v = createVehicle(U, { label: 'Araç', ownership: 'owned', fuelTypes: ['gasoline'] }, T0);
    setVehicleFuelTypes(U, v.id, ['lpg', 'gasoline'], T0 + 1);
    setVehicleFuelTypes(U, v.id, ['gasoline'], T0 + 2);
    setVehicleFuelTypes(U, v.id, ['lpg', 'gasoline'], T0 + 3);
    const alive = fuelRows(v.id).filter((r) => r.deleted_at == null);
    assert.equal(alive.filter((r) => r.is_primary === 1).length, 1);
    assert.equal(alive.find((r) => r.is_primary === 1)?.fuel_type, 'lpg');
  });

  it('liste birincili başta döner — yakıt ekranının varsayılan çipi o', () => {
    const v = createVehicle(U, { label: 'Araç', ownership: 'owned', fuelTypes: ['gasoline'] }, T0);
    setVehicleFuelTypes(U, v.id, ['lpg', 'gasoline'], T0 + 1);
    assert.deepEqual(listVehicleFuelTypes(U, v.id).map((f) => f.fuelType), ['lpg', 'gasoline']);
  });
});

describe('dolumun litre fiyatı', () => {
  beforeEach(() => resetTestDb());

  function withPrice() {
    const v = createVehicle(U, { label: 'Araç', ownership: 'owned', fuelTypes: ['gasoline'] }, T0);
    addFuelLog(U, {
      vehicleId: v.id, fuelType: 'gasoline', totalAmountKurus: k(100000),
      unitPriceKurus: k(4550), volumePer1000: 21978,
    }, 4, T0 + 1);
    return v;
  }

  it('fiyatlı dolum aracın son fiyatını günceller', () => {
    const v = withPrice();
    assert.equal(getKnownFuelFigures(U, v.id).unitPriceKurus, 4550);
  });

  it('fiyatsız (0) ya da eksi fiyatlı dolum bilinen fiyatı EZMEZ', () => {
    const v = withPrice();
    for (const price of [0, -4000]) {
      addFuelLog(U, {
        vehicleId: v.id, fuelType: 'gasoline', totalAmountKurus: k(50000),
        unitPriceKurus: k(price), volumePer1000: 0,
      }, 4, T0 + 2);
      assert.equal(getKnownFuelFigures(U, v.id).unitPriceKurus, 4550, `fiyat ${price}`);
    }
  });
});

describe('geçmiş vardiyayı düzeltmek', () => {
  beforeEach(() => resetTestDb());

  const DAY = 24 * 3_600_000;

  it('eski vardiyanın düzeltmesi aracın SON beyanını ezmez; en yenisininki günceller', () => {
    const v = createVehicle(U, { label: 'Araç', ownership: 'owned', fuelTypes: ['gasoline'] }, T0);
    const old = startShift(U, v.id, 4, T0);
    endShift(U, old.id, { distanceKm: 100, fuelConsumptionPer100Km: 7000, fuelPriceKurus: k(4000) }, T0 + 1000);
    const latest = startShift(U, v.id, 4, T0 + DAY);
    endShift(U, latest.id, { distanceKm: 200, fuelConsumptionPer100Km: 7500, fuelPriceKurus: k(4500) }, T0 + DAY + 1000);

    // Sürücü eski vardiyanın yalnızca km'sini düzeltiyor; ekran diğer
    // alanları kaydın eski değerleriyle gönderiyor.
    updateShiftTotals(U, old.id, {
      distanceKm: 110, fuelConsumptionPer100Km: 7000, fuelPriceKurus: k(4000),
    }, T0 + 2 * DAY);
    assert.deepEqual(getKnownFuelFigures(U, v.id), {
      consumptionPer100Km: 7500, unitPriceKurus: 4500, isMeasured: false,
    });
    assert.equal(getShift(U, old.id)?.distanceKm, 110);

    updateShiftTotals(U, latest.id, { fuelPriceKurus: k(4700) }, T0 + 2 * DAY + 1);
    assert.equal(getKnownFuelFigures(U, v.id).unitPriceKurus, 4700);
  });
});
