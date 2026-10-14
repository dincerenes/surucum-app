/**
 * Profil alanları ve anasayfa özeti — gerçek repo fonksiyonları üzerinde.
 *
 * - Kurulum bitince kayıtta yazılan ad ayarlara geçiyor; ayarda ad
 *   varsa üzerine yazılmıyor.
 * - Ad ve şehir kaydedilirken boşluklar temizleniyor, boş metin `null`.
 * - Anasayfa: son yedi günün çubukları, ayın toplamı yalnızca bu aydan,
 *   bugün kayıt yoksa `today` boş.
 *
 * Gerçek repo fonksiyonları ve gerçek migration'lar, node:sqlite üzerinde.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  addRide, completeOnboarding, createVehicle, endShift, getHomeOverview, getSettings,
  getShiftSummary, isOnboardingComplete, startShift, updateSettings,
} from '@/db/repo';
import type { Kurus } from '@/lib/money';
import type { BusinessDate } from '@/lib/business-date';
import { resetTestDb } from '../../../tools/test-db.ts';

const U = '0199a000-0000-7000-8000-00000000000d';
const H = 3_600_000;
const k = (n: number) => n as Kurus;

describe('kurulum ve profil alanları', () => {
  beforeEach(() => resetTestDb());

  it('kayıtta yazılan ad temizlenip ayarlara geçer, kurulum damgalanır', () => {
    const now = new Date(2026, 8, 1, 10, 0).getTime();
    completeOnboarding(U, '  Enes  ', now);
    const s = getSettings(U);
    assert.equal(s?.displayName, 'Enes');
    assert.equal(s?.onboardingCompletedAt, now);
    assert.equal(isOnboardingComplete(U), true);
  });

  it('ayarda ad varsa kayıttaki ad üzerine yazılmaz', () => {
    const now = new Date(2026, 8, 1, 10, 0).getTime();
    updateSettings(U, { displayName: 'Ali' }, now);
    completeOnboarding(U, 'Veli', now + 1000);
    const s = getSettings(U);
    assert.equal(s?.displayName, 'Ali');
    assert.equal(s?.onboardingCompletedAt, now + 1000);
  });

  it('kayıtta ad yoksa kurulum yine biter, ad boş kalır', () => {
    const now = new Date(2026, 8, 1, 10, 0).getTime();
    completeOnboarding(U, null, now);
    assert.equal(getSettings(U)?.displayName ?? null, null);
    assert.equal(isOnboardingComplete(U), true);
  });

  it('yalnızca boşluk olan ad null, şehir kırpılarak saklanır', () => {
    const now = new Date(2026, 8, 1, 10, 0).getTime();
    updateSettings(U, { displayName: 'Ali', city: 'Ankara' }, now);
    updateSettings(U, { displayName: '   ', city: ' İzmir ' }, now + 1000);
    const s = getSettings(U);
    assert.equal(s?.displayName, null);
    assert.equal(s?.city, 'İzmir');
  });
});

describe('anasayfa özeti', () => {
  beforeEach(() => resetTestDb());

  /** Verilen günde 10:00–12:00 arası, tek yolculuklu kapalı vardiya. */
  function closedShift(vehicleId: string, y: number, m: number, d: number, gross: number) {
    const t = new Date(y, m, d, 10, 0).getTime();
    const shift = startShift(U, vehicleId, 0, t);
    addRide(U, { grossAmountKurus: k(gross), shiftId: shift.id }, 0, t + H);
    endShift(U, shift.id, { distanceKm: 40, commissionKurus: k(0) }, t + 2 * H);
    return shift;
  }

  it('hafta yedi çubuk, en eski solda; ay yalnızca bu ayın günlerini sayar', () => {
    const t0 = new Date(2026, 7, 30, 9, 0).getTime();
    const v = createVehicle(U, { label: 'A', ownership: 'owned', fuelTypes: ['gasoline'] }, t0);
    const aug = closedShift(v.id, 2026, 7, 31, 30_000);
    const sep = closedShift(v.id, 2026, 8, 1, 50_000);

    const today = '2026-09-02' as BusinessDate;
    const now = new Date(2026, 8, 2, 15, 0).getTime();
    const o = getHomeOverview(U, today, now);

    // Hafta: 27 Ağustos – 2 Eylül, en eski solda, bugün en sağda.
    assert.equal(o.week.length, 7);
    assert.deepEqual(o.week.map((b) => b.date), [
      '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30',
      '2026-08-31', '2026-09-01', '2026-09-02',
    ]);
    assert.deepEqual(o.week.map((b) => b.isToday), [false, false, false, false, false, false, true]);

    const augProfit = getShiftSummary(U, aug.id)?.profit.cashProfit;
    const sepProfit = getShiftSummary(U, sep.id)?.profit.cashProfit;
    assert.ok(augProfit != null && augProfit > 0);
    assert.ok(sepProfit != null && sepProfit > 0);
    assert.equal(o.week[4].cashProfit, augProfit);
    assert.equal(o.week[5].cashProfit, sepProfit);
    // Kaydı olmayan günler sıfır değil, boş.
    for (const i of [0, 1, 2, 3, 6]) assert.equal(o.week[i].cashProfit, null);

    // Ay: yalnızca 1 Eylül — Ağustos vardiyası haftada var, ayda yok.
    assert.equal(o.month.shiftCount, 1);
    assert.equal(o.month.cashProfit, sepProfit);
    assert.equal(o.averages.workedDayCount, 1);

    // Bugün kayıt yok.
    assert.equal(o.today, null);
  });

  it('bugün kayıt varsa today dolu ve son çubuk bugünün kazancı', () => {
    const t0 = new Date(2026, 8, 1, 9, 0).getTime();
    const v = createVehicle(U, { label: 'A', ownership: 'owned', fuelTypes: ['gasoline'] }, t0);
    const shift = closedShift(v.id, 2026, 8, 2, 40_000);

    const o = getHomeOverview(U, '2026-09-02' as BusinessDate, new Date(2026, 8, 2, 15, 0).getTime());
    const profit = getShiftSummary(U, shift.id)?.profit.cashProfit;
    assert.ok(o.today != null);
    assert.equal(o.today.profit.cashProfit, profit);
    assert.equal(o.week[6].cashProfit, profit);
    assert.equal(o.week[6].isToday, true);
    assert.equal(o.month.shiftCount, 1);
  });

  it('hiç kayıt yoksa hafta boş çubuklar, ay sıfır, today null', () => {
    const o = getHomeOverview(U, '2026-09-02' as BusinessDate, new Date(2026, 8, 2, 15, 0).getTime());
    assert.equal(o.week.length, 7);
    assert.ok(o.week.every((b) => b.cashProfit === null));
    assert.equal(o.month.shiftCount, 0);
    assert.equal(o.averages.perDay, null);
    assert.equal(o.today, null);
  });
});
