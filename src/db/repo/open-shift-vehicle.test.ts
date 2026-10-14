/**
 * Vardiya ortasında Araçlarım'dan başka araç seçilince — kayıtlar yine
 * VARDİYANIN aracına yazılmalı; seçim bir sonraki vardiyada geçerli.
 *
 * Gerçek repo fonksiyonları ve gerçek migration'lar, node:sqlite üzerinde.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  ForeignRecordError, addExpense, addFuelLog, addRide, createVehicle, deactivateVehicle,
  endShift, getKnownFuelFigures, getVehicle, isVehicleOnOpenShift, seedSystemCategories,
  startShift, updateSettings,
} from '@/db/repo';
import type { Kurus } from '@/lib/money';
import type { BusinessDate } from '@/lib/business-date';
import { resetTestDb } from '../../../tools/test-db.ts';

const U = '0199a000-0000-7000-8000-00000000000a';
const OTHER = '0199b000-0000-7000-8000-00000000000b';
const T0 = new Date(2026, 8, 18, 22, 0).getTime();
const k = (n: number) => n as Kurus;

function setup() {
  const a = createVehicle(U, { label: 'A', ownership: 'owned', fuelTypes: ['gasoline'] }, T0);
  const b = createVehicle(U, { label: 'B', ownership: 'owned', fuelTypes: ['gasoline'] }, T0);
  updateSettings(U, { defaultVehicleId: a.id }, T0);
  const shift = startShift(U, a.id, 4, T0);
  // Vardiya sürerken sürücü Araçlarım'da B'yi seçiyor.
  updateSettings(U, { defaultVehicleId: b.id }, T0 + 1000);
  return { a, b, shift };
}

describe('açık vardiyanın aracı', () => {
  beforeEach(() => resetTestDb());

  it('sefer, gider ve yakıt vardiyanın aracına ve gününe yazılır', () => {
    const { a, b, shift } = setup();
    // Ertesi sabah 05:00 — takvim günü döndü, vardiya hâlâ 18'inde.
    const later = T0 + 7 * 3_600_000;

    const ride = addRide(U, { grossAmountKurus: k(25000), shiftId: shift.id, vehicleId: b.id }, 4, later);
    assert.equal(ride.vehicleId, a.id);
    assert.equal(ride.businessDate, shift.businessDate);

    const [category] = seedSystemCategories(U, T0);
    const expense = addExpense(U, {
      categoryId: category.id, amountKurus: k(5000), vehicleId: b.id, shiftId: shift.id,
      businessDate: '2026-01-01' as BusinessDate,
    }, 4, later);
    assert.equal(expense.vehicleId, a.id);
    assert.equal(expense.businessDate, shift.businessDate);

    const fuel = addFuelLog(U, {
      vehicleId: b.id, shiftId: shift.id, fuelType: 'gasoline',
      totalAmountKurus: k(100000), unitPriceKurus: k(4550), volumePer1000: 21978,
    }, 4, later);
    assert.equal(fuel.vehicleId, a.id);
    assert.equal(fuel.businessDate, shift.businessDate);

    // Fiyat da vardiyanın aracına hatırlatılır, B'ninki değişmez.
    assert.equal(getKnownFuelFigures(U, a.id).unitPriceKurus, 4550);
    assert.equal(getKnownFuelFigures(U, b.id).unitPriceKurus, null);
  });

  it('vardiyasız kayıt verilen aracı kullanır', () => {
    const { b, shift } = setup();
    endShift(U, shift.id, {}, T0 + 2000);
    const ride = addRide(U, { grossAmountKurus: k(1000), vehicleId: b.id }, 4, T0 + 3000);
    assert.equal(ride.vehicleId, b.id);
  });

  it('yabancı vardiyaya bağlanmak reddedilir', () => {
    const { shift } = setup();
    const [category] = seedSystemCategories(OTHER, T0);
    assert.throws(() => addExpense(OTHER, {
      categoryId: category.id, amountKurus: k(100), shiftId: shift.id,
    }, 4, T0), ForeignRecordError);
    const own = createVehicle(OTHER, { label: 'O', ownership: 'owned', fuelTypes: ['gasoline'] }, T0);
    assert.throws(() => addFuelLog(OTHER, {
      vehicleId: own.id, shiftId: shift.id, fuelType: 'gasoline',
      totalAmountKurus: k(100), unitPriceKurus: k(100), volumePer1000: 1000,
    }, 4, T0), ForeignRecordError);
  });

  it('açık vardiyanın aracı pasifleştirilemez; vardiya bitince pasifleşir', () => {
    const { a, shift } = setup();
    assert.equal(isVehicleOnOpenShift(U, a.id), true);
    assert.equal(deactivateVehicle(U, a.id, T0 + 5000), false);
    assert.equal(getVehicle(U, a.id)?.isActive, true);

    endShift(U, shift.id, {}, T0 + 6000);
    assert.equal(isVehicleOnOpenShift(U, a.id), false);
    assert.equal(deactivateVehicle(U, a.id, T0 + 7000), true);
    assert.equal(getVehicle(U, a.id)?.isActive, false);
  });
});
