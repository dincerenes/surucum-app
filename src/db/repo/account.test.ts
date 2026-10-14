/**
 * Hesap silme — cihazdaki temizlik.
 *
 * - Silinen hesabın bütün senkron tablolarındaki satırları, kuyruğu,
 *   kurtarma defteri ve imleçleri gider.
 * - Aynı cihazdaki öbür hesabın hiçbir şeyine dokunulmaz.
 * - Cihaz tercihleri (tema) yerinde kalır.
 *
 * Gerçek repo fonksiyonları ve gerçek migration'lar, node:sqlite üzerinde.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  addExpense, addFuelLog, addRecurringExpense, addRide, createEarningSource, createVehicle,
  ensureSettings, getThemePreference, seedSystemCategories, setGoal, setThemePreference,
  startShift, wipeLocalUserData,
} from '@/db/repo';
import { SYNC_TABLE_ORDER } from '@/db/schema';
import type { Kurus } from '@/lib/money';
import type { BusinessDate } from '@/lib/business-date';
import { noteSeen } from '@/sync/recovery';
import { markDownloaded, markError, markSuccess, setPullProgress, writeState } from '@/sync/state';
import { rawTestDb, resetTestDb } from '../../../tools/test-db.ts';

const A = '0199a000-0000-7000-8000-00000000000a';
const B = '0199a000-0000-7000-8000-00000000000b';
const T0 = new Date(2026, 8, 18, 9, 0).getTime();
const H = 3_600_000;
const k = (n: number) => n as Kurus;

/** Her senkron tabloya en az bir satır düşüren tam bir hesap. */
function seedAccount(userId: string) {
  ensureSettings(userId, T0);
  const v = createVehicle(userId, { label: 'A', ownership: 'owned', fuelTypes: ['gasoline'] }, T0);
  createEarningSource(userId, { name: 'Uber' }, T0);
  const [category] = seedSystemCategories(userId, T0);
  setGoal(userId, k(100_000), 'daily', T0);

  const shift = startShift(userId, v.id, 0, T0);
  addRide(userId, { grossAmountKurus: k(50_000), shiftId: shift.id }, 0, T0 + H);
  addExpense(userId, { categoryId: category.id, amountKurus: k(10_000), shiftId: shift.id }, 0, T0 + H);
  addFuelLog(userId, {
    vehicleId: v.id, shiftId: shift.id, fuelType: 'gasoline',
    totalAmountKurus: k(20_000), unitPriceKurus: k(4_500), volumePer1000: 4444,
  }, 0, T0 + H);
  addRecurringExpense(userId, {
    categoryId: category.id, name: 'Plaka kirası', amountKurus: k(900_000),
    period: 'monthly', startDate: '2026-09-01' as BusinessDate,
  }, T0);

  // Hesaba bağlı senkron durumu: imleç, son sonuç, kurtarma bayrakları.
  setPullProgress(userId, 'rides', {
    key: { ts: '2026-09-18T09:00:00.000000+00:00', id: shift.id }, drained: true,
  });
  markSuccess(userId, T0);
  markError(userId, 'deneme', T0 + H);
  markDownloaded(userId, T0);
  writeState(`recovery_v2:${userId}`, 'done');
  writeState(`recovery_v2:${userId}:rides`, 'done');
  noteSeen(userId, 'rides', shift.id);
}

function count(table: string, userId: string): number {
  const row = rawTestDb().prepare(
    `SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`,
  ).get(userId) as { n: number };
  return Number(row.n);
}

function stateKeys(userId: string): string[] {
  return (rawTestDb().prepare(
    'SELECT key FROM sync_state WHERE instr(key, ?) > 0 ORDER BY key',
  ).all(userId) as { key: string }[]).map((r) => r.key);
}

const LOCAL_TABLES = [...SYNC_TABLE_ORDER, 'outbox', 'sync_recovery_seen'];

describe('hesap silme: cihazdaki temizlik', () => {
  beforeEach(() => resetTestDb());

  it('silinen hesabın her şeyi gider, öbür hesaba ve cihaz tercihine dokunulmaz', () => {
    seedAccount(A);
    seedAccount(B);
    setThemePreference('dark', T0);

    // Kurulum gerçekten her tabloyu dolduruyor mu — yoksa test boşa geçer.
    for (const table of LOCAL_TABLES) {
      assert.ok(count(table, A) > 0, `${table}: A için kurulum satırı yok`);
      assert.ok(count(table, B) > 0, `${table}: B için kurulum satırı yok`);
    }
    assert.ok(stateKeys(A).includes(`downloaded:${A}`));
    assert.ok(stateKeys(A).length >= 6);

    const before = Object.fromEntries(LOCAL_TABLES.map((t) => [t, count(t, B)]));
    const bKeys = stateKeys(B);

    wipeLocalUserData(A);

    for (const table of LOCAL_TABLES) {
      assert.equal(count(table, A), 0, `${table}: A'nın satırı kaldı`);
      assert.equal(count(table, B), before[table], `${table}: B'nin satırı değişti`);
    }
    assert.deepEqual(stateKeys(A), []);
    assert.deepEqual(stateKeys(B), bKeys);
    assert.equal(getThemePreference(), 'dark');
  });

  it('başka hesabın anahtarıyla önek paylaşan kimlik silinmez', () => {
    // `pull:<A>:` öneki, kimliği A ile başlayan başka bir hesabı yakalamamalı.
    const longer = `${A}-x`;
    setPullProgress(longer, 'rides', {
      key: { ts: '2026-09-18T09:00:00.000000+00:00', id: A }, drained: true,
    });
    markSuccess(longer, T0);

    wipeLocalUserData(A);

    assert.deepEqual(stateKeys(longer), [`last_error:${longer}`, `last_success_at:${longer}`, `pull:${longer}:rides`]);
  });

  it('kaydı olmayan hesapta hata vermez', () => {
    seedAccount(B);
    assert.doesNotThrow(() => wipeLocalUserData(A));
    assert.ok(count('rides', B) > 0);
  });
});
