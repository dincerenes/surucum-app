/**
 * Kurulumun "Başla" adımı — taslaktan araç, seçili araç ve kurulum damgası.
 *
 * - Sihirbazın cevapları araca eksiksiz geçiyor, katsayı cevaplardan.
 * - Sonrasında uygulama kurulumu bir daha açmıyor (çalışan araç var).
 * - Hesapta araç zaten varsa ikinci araç AÇILMIYOR — çift araç hatası.
 *
 * Gerçek repo fonksiyonları ve gerçek migration'lar, node:sqlite üzerinde.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  createVehicle, finishSetup, getSettings, isOnboardingComplete, listActiveVehicles,
} from '@/db/repo';
import { INITIAL_SETUP_DRAFT, type SetupDraft } from '@/lib/setup-answers';
import { resolveWorkingVehicle } from '@/lib/vehicle-resolve';
import { resetTestDb } from '../../../tools/test-db.ts';

const U = '0199a000-0000-7000-8000-00000000000e';
const T0 = new Date(2026, 8, 23, 12, 0).getTime();

const DRAFT: SetupDraft = {
  ...INITIAL_SETUP_DRAFT,
  make: 'Fiat', model: 'Egea', year: '2023',
  fuels: ['gasoline', 'lpg'], transmission: 'manual',
  maintenanceKm: '10.000', maintenanceCost: '8.000',
  tireKm: '40.000', tireCost: '16.000',
  marketValue: '900.000', odometer: '150.000',
};

describe('kurulumu bitirme', () => {
  beforeEach(() => resetTestDb());

  it('cevaplar araca geçer, araç seçilir, kurulum bir daha açılmaz', () => {
    const v = finishSetup(U, DRAFT, 'Enes', T0);
    assert.ok(v);
    assert.equal(v.label, 'Fiat Egea 2023');
    assert.equal(v.make, 'Fiat');
    assert.equal(v.modelYear, 2023);
    assert.equal(v.initialOdometerKm, 150_000);
    assert.equal(v.transmission, 'manual');
    // Hasar kaydı artık sorulmuyor ve yazılmıyor.
    assert.equal(v.hasAccidentRecord, null);
    assert.equal(v.wearPerKmKurus, 80);

    const settings = getSettings(U);
    assert.equal(settings?.defaultVehicleId, v.id);
    assert.equal(settings?.displayName, 'Enes');
    assert.equal(isOnboardingComplete(U), true);

    // `useDriver().needsSetup` = çalışan araç yok
    const { next } = resolveWorkingVehicle(listActiveVehicles(U), settings?.defaultVehicleId ?? null, null);
    assert.equal(next?.id, v.id);
  });

  it('her şey atlanırsa araç yine açılır, pay varsayılandan', () => {
    const v = finishSetup(U, INITIAL_SETUP_DRAFT, null, T0);
    assert.equal(v?.label, 'Aracım');
    assert.equal(v?.wearPerKmKurus, 100);
    assert.equal(v?.initialOdometerKm, null);
  });

  it('hesapta araç varsa ikinci araç açılmaz', () => {
    createVehicle(U, { label: 'Buluttan inen', ownership: 'owned', fuelTypes: ['diesel'] }, T0);
    const v = finishSetup(U, DRAFT, null, T0 + 1);
    assert.equal(v, null);
    assert.equal(listActiveVehicles(U).length, 1);
    assert.equal(isOnboardingComplete(U), true);
  });

  it('iki kez basılırsa ikinci basış araç açmaz', () => {
    finishSetup(U, DRAFT, null, T0);
    finishSetup(U, DRAFT, null, T0 + 1);
    assert.equal(listActiveVehicles(U).length, 1);
  });
});
