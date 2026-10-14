import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_WEAR_PER_KM } from '../db/schema/_shared.ts';
import { FALLBACK_WEAR_KURUS, WEAR_SHARE_PCT, calculateWear, wearFor } from './wear.ts';

// 1 ₺ = 100 kuruş
const TL = (n: number) => n * 100;

describe('yıpranma payı', () => {
  it('sürücünün örneği: 8.000/10.000 + 16.000/40.000 + 900.000 ₺ araç = 2,01 ₺ ham, 0,80 ₺/km pay', () => {
    const w = calculateWear({
      maintenanceCostKurus: TL(8_000), maintenanceIntervalKm: 10_000,
      tireCostKurus: TL(16_000), tireIntervalKm: 40_000,
      marketValueKurus: TL(900_000),
    });
    assert.equal(w.maintenance.perKm, 32);
    assert.equal(w.tires.perKm, 16);
    assert.ok(Math.abs(w.depreciation.perKm - 32.4) < 1e-9);
    assert.equal(w.total, 80);
    assert.equal(w.maintenance.estimated || w.tires.estimated || w.depreciation.estimated, false);
  });

  it('hiçbir şey bilinmiyorsa eski sabit katsayının %40\'ı çıkar: 1,00 ₺/km', () => {
    const w = calculateWear({});
    assert.equal(w.total, 100);
    assert.equal(w.total, (DEFAULT_WEAR_PER_KM.owned * WEAR_SHARE_PCT) / 100);
    assert.equal(
      FALLBACK_WEAR_KURUS.maintenance + FALLBACK_WEAR_KURUS.tires + FALLBACK_WEAR_KURUS.depreciation,
      DEFAULT_WEAR_PER_KM.owned,
    );
    assert.ok(w.maintenance.estimated && w.tires.estimated && w.depreciation.estimated);
  });

  it('yalnızca bilinmeyen kalem varsayılandan gelir', () => {
    const w = calculateWear({ marketValueKurus: TL(1_000_000) });
    assert.equal(w.depreciation.perKm, 36);
    assert.equal(w.depreciation.estimated, false);
    assert.equal(w.total, 36 + 24 + 16);
  });

  it('aralık yoksa ya da sıfırsa maliyet tek başına kullanılmaz', () => {
    assert.equal(calculateWear({ maintenanceCostKurus: TL(8_000) }).maintenance.estimated, true);
    assert.equal(calculateWear({
      maintenanceCostKurus: TL(8_000), maintenanceIntervalKm: 0,
    }).maintenance.estimated, true);
  });

  it('pay ham maliyetin en az %60 altında', () => {
    assert.ok(WEAR_SHARE_PCT <= 40);
  });

  it('kesirli kalemler yalnızca toplamda yuvarlanır', () => {
    const w = calculateWear({
      maintenanceCostKurus: TL(7_000), maintenanceIntervalKm: 15_000, // 46,67
      tireCostKurus: TL(10_000), tireIntervalKm: 30_000, // 33,33
      marketValueKurus: TL(500_000), // 45
    });
    // Ham 125 → pay 18,67 + 13,33 + 18 = 50
    assert.equal(w.total, 50);
  });

  it('kiralık araçta ve işveren aracında pay sıfır, girilen kalemler sayılmaz', () => {
    const inputs = { marketValueKurus: TL(900_000) };
    assert.equal(wearFor('rented_vehicle', inputs), 0);
    assert.equal(wearFor('employer', inputs), 0);
    assert.equal(wearFor('owned', inputs), 72); // 32,4 + 24 + 16
    assert.equal(wearFor('rented_plate', inputs), 72);
  });
});
