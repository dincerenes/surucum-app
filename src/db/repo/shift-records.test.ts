/**
 * Vardiya bazlı kayıtlar — her kayıt bir vardiyaya ait.
 *
 * - Gider vardiyasına bağlanıyor ve vardiya kartında sayılıyor.
 * - Vardiya kartlarının toplamı dönem özetine eşit.
 * - Vardiya silinince yolcuları, giderleri ve dolumları da gidiyor;
 *   geride "vardiya dışı" kayıt kalmıyor ve silmeler buluta gidiyor.
 *
 * Gerçek repo fonksiyonları ve gerçek migration'lar, node:sqlite üzerinde.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  addExpense, addFuelLog, addRide, createVehicle, deleteShift, endShift, getShiftSummary,
  listDaySummaries, listExpensesInShift, listPeriodRecords, listRidesInShift,
  listShiftSummariesInRange, seedSystemCategories, startShift,
} from '@/db/repo';
import { getDb } from '@/db/client';
import { outbox } from '@/db/schema';
import type { Kurus } from '@/lib/money';
import type { BusinessDate } from '@/lib/business-date';
import { calculatePeriodTotals } from '@/lib/stats';
import { resetTestDb } from '../../../tools/test-db.ts';

const U = '0199a000-0000-7000-8000-00000000000c';
const T0 = new Date(2026, 8, 18, 9, 0).getTime();
const H = 3_600_000;
const k = (n: number) => n as Kurus;
const DAY = '2026-09-18' as BusinessDate;

function twoShifts() {
  const v = createVehicle(U, { label: 'A', ownership: 'owned', fuelTypes: ['gasoline'] }, T0);
  const [category] = seedSystemCategories(U, T0);

  const first = startShift(U, v.id, 0, T0);
  addRide(U, { grossAmountKurus: k(50_000), shiftId: first.id }, 0, T0 + H);
  addExpense(U, { categoryId: category.id, amountKurus: k(10_000), shiftId: first.id }, 0, T0 + H);
  endShift(U, first.id, { distanceKm: 100, commissionKurus: k(5_000) }, T0 + 2 * H);

  const second = startShift(U, v.id, 0, T0 + 5 * H);
  addRide(U, { grossAmountKurus: k(80_000), shiftId: second.id }, 0, T0 + 6 * H);
  addFuelLog(U, {
    vehicleId: v.id, shiftId: second.id, fuelType: 'gasoline',
    totalAmountKurus: k(20_000), unitPriceKurus: k(4_500), volumePer1000: 4444,
  }, 0, T0 + 6 * H);
  endShift(U, second.id, { distanceKm: 50, commissionKurus: k(8_000) }, T0 + 7 * H);

  return { first, second };
}

describe('vardiya bazlı kayıtlar', () => {
  beforeEach(() => resetTestDb());

  it('gider girildiği vardiyaya bağlanır ve yalnızca onun kartında sayılır', () => {
    const { first, second } = twoShifts();
    assert.equal(listExpensesInShift(U, first.id).length, 1);
    assert.equal(listExpensesInShift(U, second.id).length, 0);
    assert.equal(getShiftSummary(U, first.id)?.profit.expensesPaid, 10_000);
    assert.equal(getShiftSummary(U, second.id)?.profit.expensesPaid, 0);
  });

  it('vardiya kartlarının toplamı dönem özetine eşit', () => {
    twoShifts();
    const shifts = listShiftSummariesInRange(U, DAY, DAY);
    assert.equal(shifts.length, 2);
    const totals = calculatePeriodTotals(listDaySummaries(U, DAY, DAY));
    const sum = (pick: (s: (typeof shifts)[number]) => number) =>
      shifts.reduce((acc, s) => acc + pick(s), 0);
    assert.equal(sum((s) => s.summary.profit.revenue), totals.revenue);
    assert.equal(sum((s) => s.summary.profit.cashProfit), totals.cashProfit);
    assert.equal(sum((s) => s.summary.profit.trueProfit), totals.trueProfit);
    assert.equal(totals.shiftCount, 2);
  });

  it('vardiya silinince kayıtları da silinir ve hepsi kuyruğa düşer', () => {
    const { first, second } = twoShifts();
    assert.equal(deleteShift(U, first.id, T0 + 8 * H), true);

    assert.equal(listRidesInShift(U, first.id).length, 0);
    assert.equal(listExpensesInShift(U, first.id).length, 0);
    assert.equal(listRidesInShift(U, second.id).length, 1);

    const records = listPeriodRecords(U, DAY, DAY);
    assert.deepEqual(records.items.map((i) => i.data.shift.id), [second.id]);
    assert.equal(records.totals.revenue, 80_000);

    const deletes = getDb().select().from(outbox).all()
      .filter((o) => o.operation === 'delete').map((o) => o.tableName).sort();
    assert.deepEqual(deletes, ['expenses', 'rides', 'shifts']);
  });

  it('başka hesabın vardiyası silinmez', () => {
    const { first } = twoShifts();
    assert.equal(deleteShift('0199b000-0000-7000-8000-00000000000d', first.id), false);
    assert.equal(listRidesInShift(U, first.id).length, 1);
  });
});
