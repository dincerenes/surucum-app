import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  type MergeableSettings, mergeSettingsRows, pickDuplicatesToRemove,
} from './settings-merge.ts';

function row(over: Partial<MergeableSettings> = {}): MergeableSettings {
  return {
    id: 'a',
    createdAt: 1000,
    updatedAt: 1000,
    dayCutoffHour: 4,
    defaultVehicleId: null,
    defaultEarningSourceId: null,
    regionCode: 'TR',
    onboardingCompletedAt: null,
    displayName: null,
    city: null,
    avatar: null,
    ...over,
  };
}

describe('ayar satırlarının birleştirilmesi', () => {
  it('tek satır varsa birleştirme yok', () => {
    assert.equal(mergeSettingsRows([row()]), null);
    assert.equal(mergeSettingsRows([]), null);
  });

  it('EN ESKİ satır yaşıyor, diğerleri siliniyor', () => {
    const m = mergeSettingsRows([
      row({ id: 'yeni', createdAt: 3000 }),
      row({ id: 'eski', createdAt: 1000 }),
      row({ id: 'orta', createdAt: 2000 }),
    ])!;
    assert.equal(m.survivor.id, 'eski');
    assert.deepEqual(m.removeIds.sort(), ['orta', 'yeni']);
  });

  it('alan değeri EN SON GÜNCELLENEN satırdan gelir', () => {
    const m = mergeSettingsRows([
      row({ id: 'eski', createdAt: 1000, updatedAt: 1000, dayCutoffHour: 4 }),
      row({ id: 'yeni', createdAt: 2000, updatedAt: 5000, dayCutoffHour: 6 }),
    ])!;
    assert.equal(m.survivor.id, 'eski');
    assert.equal(m.patch.dayCutoffHour, 6);
  });

  it('BOŞ değer taze sayılmaz — ayar sıfırlanmaz', () => {
    const m = mergeSettingsRows([
      row({ id: 'eski', createdAt: 1000, updatedAt: 1000, defaultVehicleId: 'arac-1' }),
      // Daha yeni ama aracı boş: eski seçim korunmalı.
      row({ id: 'yeni', createdAt: 2000, updatedAt: 9000, defaultVehicleId: null }),
    ])!;
    assert.equal(m.patch.defaultVehicleId, undefined);
    assert.equal(m.survivor.defaultVehicleId, 'arac-1');
  });

  it('HERHANGİ biri kurulumu bitmiş diyorsa kurulum bitmiştir', () => {
    // Gerçek cihazdaki durum: hayatta kalan satırın damgası boş.
    const m = mergeSettingsRows([
      row({ id: 'eski', createdAt: 1000, onboardingCompletedAt: null }),
      row({ id: 'yeni', createdAt: 2000, onboardingCompletedAt: 7777 }),
    ])!;
    assert.equal(m.survivor.id, 'eski');
    assert.equal(m.patch.onboardingCompletedAt, 7777);
  });

  it('kurulum damgasının EN ERKENİ geçerli', () => {
    const m = mergeSettingsRows([
      row({ id: 'eski', createdAt: 1000, onboardingCompletedAt: 9999 }),
      row({ id: 'yeni', createdAt: 2000, onboardingCompletedAt: 5555 }),
    ])!;
    assert.equal(m.patch.onboardingCompletedAt, 5555);
  });

  it('ad ve şehir en taze DOLU satırdan gelir', () => {
    const m = mergeSettingsRows([
      row({ id: 'eski', createdAt: 1000, updatedAt: 1000, displayName: 'Enes', city: 'İzmir' }),
      // Yeni cihazda açılan boş satır adı silmemeli; şehri değiştiren satır kazanır.
      row({ id: 'yeni', createdAt: 2000, updatedAt: 9000, displayName: null, city: 'Ankara' }),
    ])!;
    assert.equal(m.patch.displayName, undefined);
    assert.equal(m.patch.city, 'Ankara');
  });

  it('değişiklik yoksa yama boş kalır', () => {
    const m = mergeSettingsRows([
      row({ id: 'eski', createdAt: 1000, updatedAt: 1000 }),
      row({ id: 'yeni', createdAt: 2000, updatedAt: 2000 }),
    ])!;
    assert.deepEqual(m.patch, {});
  });
});

describe('çoğalmış tekil kayıtlar', () => {
  it('tek kayıtta silinecek yok', () => {
    assert.equal(pickDuplicatesToRemove([{ id: 'a', createdAt: 1 }]), null);
  });

  it('en eskisi kalır', () => {
    const r = pickDuplicatesToRemove([
      { id: 'b', createdAt: 200 },
      { id: 'a', createdAt: 100 },
      { id: 'c', createdAt: 300 },
    ])!;
    assert.equal(r.keep.id, 'a');
    assert.deepEqual(r.removeIds.sort(), ['b', 'c']);
  });
});
