/**
 * Yakıt modeli uçtan uca: dolum vardiyaya bağlanıyor, özet bağı okuyor.
 *
 * Saf hesap `lib/day-summary.test.ts`'te; burada gerçek repo yazma
 * yolları ve gerçek okuma sorguları birlikte koşuyor — sütun seçilmezse
 * ya da bağ yazılmazsa bu testler yakalar.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  addFuelLog, addRide, createVehicle, endShift, getDaySummary, getFuelLog,
  listDaySummaries, listFuelLogsInShift, listShiftsInRange, startShift,
} from '@/db/repo';
import type { Kurus } from '@/lib/money';
import type { BusinessDate } from '@/lib/business-date';
import { groupRecordsByDay } from '@/lib/records-by-day';
import { resetTestDb } from '../../../tools/test-db.ts';

const U = '0199a000-0000-7000-8000-00000000000a';
const H = 3_600_000;
const T0 = new Date(2026, 8, 18, 8, 0).getTime();
const D0 = '2026-09-18' as BusinessDate;
const k = (n: number) => n as Kurus;

function vehicle() {
  return createVehicle(U, { label: 'Araç', ownership: 'owned', fuelTypes: ['gasoline'] }, T0);
}

describe('yakıt modeli — repo', () => {
  beforeEach(() => resetTestDb());

  it('açık vardiyada girilen dolum vardiyaya bağlanır', () => {
    const v = vehicle();
    const s = startShift(U, v.id, 4, T0);
    const f = addFuelLog(U, {
      vehicleId: v.id, shiftId: s.id, fuelType: 'gasoline',
      totalAmountKurus: k(70_000), unitPriceKurus: k(5_000), volumePer1000: 14_000,
    }, 4, T0 + H);
    assert.equal(getFuelLog(U, f.id)?.shiftId, s.id);

    const vardiyasiz = addFuelLog(U, {
      vehicleId: v.id, fuelType: 'gasoline',
      totalAmountKurus: k(10_000), unitPriceKurus: k(5_000), volumePer1000: 2_000,
    }, 4, T0 + H);
    assert.equal(getFuelLog(U, vardiyasiz.id)?.shiftId, null);

    // Vardiya detayı bağlı dolumları okuyor — vardiyasız olan gelmez.
    assert.deepEqual(listFuelLogsInShift(U, s.id).map((x) => x.id), [f.id]);
  });

  it('iki vardiya: biri tüketimli, öteki bağlı dolumlu — ikisi de sayılır', () => {
    const v = vehicle();
    const a = startShift(U, v.id, 4, T0);
    endShift(U, a.id, {
      distanceKm: 100, fuelConsumptionPer100Km: 10_000, fuelPriceKurus: k(5_000),
      commissionKurus: k(0),
    }, T0 + 4 * H);

    const b = startShift(U, v.id, 4, T0 + 5 * H);
    addRide(U, { grossAmountKurus: k(200_000), shiftId: b.id }, 4, T0 + 6 * H);
    addFuelLog(U, {
      vehicleId: v.id, shiftId: b.id, fuelType: 'gasoline',
      totalAmountKurus: k(30_000), unitPriceKurus: k(5_000), volumePer1000: 6_000,
    }, 4, T0 + 6 * H);
    endShift(U, b.id, { distanceKm: 40, commissionKurus: k(0) }, T0 + 9 * H);

    const s = getDaySummary(U, D0, T0 + 10 * H);
    assert.equal(s.profit.fuelPaid, 80_000);      // 500 ₺ tüketim + 300 ₺ dolum
    assert.equal(s.completeness.fuelSource, 'mixed');
    assert.equal(s.completeness.fuel, 'complete');

    // Aynı hesap İstatistik'in toplu okumasından da çıkıyor.
    const [day] = listDaySummaries(U, D0, D0, T0 + 10 * H);
    assert.equal(day.summary.profit.fuelPaid, 80_000);
  });

  it('yalnızca vardiyası olan gün Kayıtlar ile İstatistik\'te aynı günler', () => {
    const v = vehicle();
    const s = startShift(U, v.id, 4, T0);
    endShift(U, s.id, { distanceKm: 50, commissionKurus: k(10_000) }, T0 + H);

    const from = '2026-09-01' as BusinessDate;
    const to = '2026-09-30' as BusinessDate;
    const stats = listDaySummaries(U, from, to, T0 + 2 * H).map((d) => d.date);
    const records = groupRecordsByDay([], listShiftsInRange(U, from, to)).map((d) => d.date);
    assert.deepEqual(records, stats);
    assert.deepEqual(records, [D0]);

    const [day] = listDaySummaries(U, from, to, T0 + 2 * H);
    assert.equal(day.summary.hasActivity, true);
    assert.equal(day.summary.profit.cashProfit, -10_000);
  });
});
