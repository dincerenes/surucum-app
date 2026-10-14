/**
 * Yıpranma katsayısı vardiyaya kopyalanıyor — araç sonradan düzenlense de
 * geçmiş günlerin gerçek kârı kaymamalı.
 *
 * Gerçek repo fonksiyonları ve gerçek migration'lar, node:sqlite üzerinde.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  countShiftsAffectedByOwnership, createVehicle, endShift, getDaySummary, getShift, getVehicle,
  startShift, updateVehicle,
} from '@/db/repo';
import type { BusinessDate } from '@/lib/business-date';
import { rawTestDb, resetTestDb } from '../../../tools/test-db.ts';

const U = '0199a000-0000-7000-8000-00000000000a';
const DAY = 24 * 3_600_000;
const T0 = new Date(2026, 8, 18, 12, 0).getTime();
const D0 = '2026-09-18' as BusinessDate;

/** 100 km'lik kapanmış bir vardiya. */
function closedShift(vehicleId: string, at: number) {
  const s = startShift(U, vehicleId, 4, at);
  endShift(U, s.id, { distanceKm: 100 }, at + 3_600_000);
  return s;
}

function queuedShiftIds(): string[] {
  return rawTestDb().prepare(
    "SELECT row_id FROM outbox WHERE table_name = 'shifts' ORDER BY row_id",
  ).all().map((r) => String(r.row_id));
}

describe('vardiyanın yıpranma kopyası', () => {
  beforeEach(() => resetTestDb());

  it('vardiya açılırken aracın katsayısı kopyalanır', () => {
    const v = createVehicle(U, { label: 'Araç', ownership: 'owned', fuelTypes: ['gasoline'] }, T0);
    const s = startShift(U, v.id, 4, T0);
    assert.equal(getShift(U, s.id)?.wearPerKmKurus, 100);
  });

  it('yalnızca adı değişen aracın katsayısı DEĞİŞMEZ (eski 300 korunur)', () => {
    const v = createVehicle(U, { label: 'Araç', ownership: 'owned', fuelTypes: ['gasoline'] }, T0);
    // Sabit 300'den 250'ye inmeden önce açılmış bir araç.
    rawTestDb().prepare('UPDATE vehicles SET wear_per_km_kurus = 300 WHERE id = ?').run(v.id);

    updateVehicle(U, v.id, { label: 'Yeni ad', ownership: 'owned' }, T0 + 1);
    assert.equal(getVehicle(U, v.id)?.wearPerKmKurus, 300);
    assert.equal(getVehicle(U, v.id)?.label, 'Yeni ad');
  });

  it('"hayır, bugünden itibaren": geçmiş vardiyanın gerçek kârı kaymaz, yenisi yeni katsayıyla', () => {
    const v = createVehicle(U, { label: 'Araç', ownership: 'owned', fuelTypes: ['gasoline'] }, T0);
    closedShift(v.id, T0);
    const before = getDaySummary(U, D0, T0 + DAY);
    assert.equal(before.profit.wearShare, 10000);

    rawTestDb().exec('DELETE FROM outbox');
    updateVehicle(U, v.id, { ownership: 'rented_vehicle' }, T0 + DAY, {
      applyWearToPastShifts: false,
    });

    assert.equal(getVehicle(U, v.id)?.wearPerKmKurus, 0);
    assert.equal(getDaySummary(U, D0, T0 + DAY).profit.wearShare, 10000);
    assert.deepEqual(queuedShiftIds(), [], 'kopyası olan vardiyaya dokunulmaz');

    const next = startShift(U, v.id, 4, T0 + DAY);
    assert.equal(getShift(U, next.id)?.wearPerKmKurus, 0);
  });

  it('"evet, yanlış girmiştim": geçmiş vardiyalar yeni katsayıya geçer ve kuyruğa girer', () => {
    const v = createVehicle(U, { label: 'Araç', ownership: 'owned', fuelTypes: ['gasoline'] }, T0);
    const a = closedShift(v.id, T0);
    const b = closedShift(v.id, T0 + DAY);

    rawTestDb().exec('DELETE FROM outbox');
    updateVehicle(U, v.id, { ownership: 'employer' }, T0 + 2 * DAY, {
      applyWearToPastShifts: true,
    });

    assert.equal(getShift(U, a.id)?.wearPerKmKurus, 0);
    assert.equal(getShift(U, b.id)?.wearPerKmKurus, 0);
    assert.equal(getShift(U, a.id)?.updatedAt, T0 + 2 * DAY);
    assert.deepEqual(queuedShiftIds(), [a.id, b.id].sort());
    assert.equal(getDaySummary(U, D0, T0 + 3 * DAY).profit.wearShare, 0);
  });

  it('kopyası olmayan eski vardiya "hayır" deyince ESKİ katsayıyla donar', () => {
    const v = createVehicle(U, { label: 'Araç', ownership: 'owned', fuelTypes: ['gasoline'] }, T0);
    const s = closedShift(v.id, T0);
    // Bu sütundan önceki bir sürümde açılıp buluttan öyle inmiş vardiya.
    rawTestDb().prepare('UPDATE shifts SET wear_per_km_kurus = NULL WHERE id = ?').run(s.id);
    assert.equal(getDaySummary(U, D0, T0 + DAY).profit.wearShare, 10000, 'araca düşülür');

    rawTestDb().exec('DELETE FROM outbox');
    updateVehicle(U, v.id, { ownership: 'rented_vehicle' }, T0 + DAY, {
      applyWearToPastShifts: false,
    });

    assert.equal(getShift(U, s.id)?.wearPerKmKurus, 100);
    assert.equal(getDaySummary(U, D0, T0 + DAY).profit.wearShare, 10000);
    assert.deepEqual(queuedShiftIds(), [s.id]);
  });

  it('soru yalnızca bir şeyi değiştirecekse sorulur', () => {
    const v = createVehicle(U, { label: 'Araç', ownership: 'owned', fuelTypes: ['gasoline'] }, T0);
    assert.equal(countShiftsAffectedByOwnership(U, v.id, 'rented_vehicle'), 0, 'vardiya yok');

    closedShift(v.id, T0);
    closedShift(v.id, T0 + DAY);
    assert.equal(countShiftsAffectedByOwnership(U, v.id, 'owned'), 0, 'sahiplik aynı');
    assert.equal(countShiftsAffectedByOwnership(U, v.id, 'rented_plate'), 0, 'katsayı aynı');
    assert.equal(countShiftsAffectedByOwnership(U, v.id, 'rented_vehicle'), 2);
  });

  it('kapanırken kopyası olmayan vardiya bir kez doldurulur, dolu olan değişmez', () => {
    const v = createVehicle(U, { label: 'Araç', ownership: 'owned', fuelTypes: ['gasoline'] }, T0);
    const s = startShift(U, v.id, 4, T0);
    rawTestDb().prepare('UPDATE shifts SET wear_per_km_kurus = NULL WHERE id = ?').run(s.id);
    endShift(U, s.id, { distanceKm: 50 }, T0 + 1000);
    assert.equal(getShift(U, s.id)?.wearPerKmKurus, 100);

    rawTestDb().prepare('UPDATE vehicles SET wear_per_km_kurus = 0 WHERE id = ?').run(v.id);
    endShift(U, s.id, { distanceKm: 60 }, T0 + 2000);
    assert.equal(getShift(U, s.id)?.wearPerKmKurus, 100);
  });
});
