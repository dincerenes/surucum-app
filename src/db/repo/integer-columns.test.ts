/**
 * Bulutta tam sayı olan sütunlara yerelde YALNIZCA tam sayı yazılıyor mu?
 *
 * SQLite ondalığı sessizce kabul ediyor; Postgres `integer`/`bigint`
 * sütununda reddediyor. Gönderim bir tablonun bekleyen satırlarını tek
 * istekte yolladığı için tek bir "238,5" km o tablonun bütün yedeğini
 * kalıcı olarak takıyordu ve sürücü bunu göremiyordu.
 *
 * Buradaki her yazma yolu ekranların üretebileceği KÜSURATLI sayılarla
 * çağrılıyor (kilometre, süre, tüketim, sayaç, model yılı). Para tutarları
 * `Kurus` markalı tipten geçtiği için derleyici küsuratı zaten
 * engelliyor; onlar tam sayı veriliyor. Sonra `supabase/cloud-columns.json`
 * içindeki her tam sayı sütunu, her satırda denetleniyor.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, it } from 'node:test';
import {
  SYNCED_TABLES, addExpense, addFuelLog, addRecurringExpense, addRide, createEarningSource,
  createVehicle, endShift, rememberStatedFuelFigures, seedSystemCategories, setGoal,
  setVehicleFuelTypes, startShift, updateFuelLog, updateRide, updateSettings,
  updateShiftTotals, updateVehicle,
} from '@/db/repo';
import type { Kurus } from '@/lib/money';
import type { BusinessDate } from '@/lib/business-date';
import { rawTestDb, resetTestDb } from '../../../tools/test-db.ts';

const manifest: { int: Record<string, Record<string, 'integer' | 'bigint'>> } = JSON.parse(
  readFileSync(new URL('../../../supabase/cloud-columns.json', import.meta.url), 'utf8'),
);

const U = '0199a000-0000-7000-8000-00000000000a';
const T0 = new Date(2026, 8, 18, 12, 0).getTime();
const k = (n: number) => n as Kurus;

const INT4_MIN = -(2 ** 31);
const INT4_MAX = 2 ** 31 - 1;

/** Tam sayı olmayan ya da int4 aralığını aşan her hücre. */
function violations(): string[] {
  const db = rawTestDb();
  const out: string[] = [];
  for (const table of SYNCED_TABLES) {
    for (const [column, type] of Object.entries(manifest.int[table] ?? {})) {
      const rows = db.prepare(
        `SELECT id, "${column}" AS v, typeof("${column}") AS t FROM "${table}"
         WHERE typeof("${column}") NOT IN ('integer', 'null')`,
      ).all();
      for (const r of rows) out.push(`${table}.${column} = ${r.v} (${r.t})`);

      if (type === 'integer') {
        const wide = db.prepare(
          `SELECT id, "${column}" AS v FROM "${table}" WHERE "${column}" < ? OR "${column}" > ?`,
        ).all(INT4_MIN, INT4_MAX);
        for (const r of wide) out.push(`${table}.${column} = ${r.v} int4 aralığı dışında`);
      }
    }
  }
  return out;
}

describe('bulutta tam sayı olan sütunlar', () => {
  beforeEach(() => resetTestDb());

  it('manifest her senkronlanan tabloyu kapsıyor', () => {
    for (const table of SYNCED_TABLES) {
      assert.ok(manifest.int[table], `${table} manifest.int içinde yok`);
    }
  });

  it('küsuratlı girdiyle çağrılan yazma yolları yalnızca tam sayı yazıyor', () => {
    const vehicle = createVehicle(U, {
      label: 'Araç', ownership: 'owned', fuelTypes: ['gasoline', 'lpg'],
      modelYear: 2019.6, initialOdometerKm: 123456.5,
    }, T0);
    updateVehicle(U, vehicle.id, { modelYear: 2020.4, initialOdometerKm: 150000.5 }, T0 + 1);
    setVehicleFuelTypes(U, vehicle.id, ['lpg', 'gasoline'], T0 + 2);
    updateSettings(U, { defaultVehicleId: vehicle.id, dayCutoffHour: 5.5 }, T0);

    const source = createEarningSource(U, { name: 'Sefer geliri' }, T0);
    const shift = startShift(U, vehicle.id, 4, T0);
    const ride = addRide(U, {
      grossAmountKurus: k(25050), shiftId: shift.id, earningSourceId: source.id,
      distanceMeters: 3400.5, durationSeconds: 612.5,
    }, 4, T0 + 1000);
    updateRide(U, ride.id, { distanceMeters: 4100.7, durationSeconds: 700.2 }, T0 + 1500);

    const [category] = seedSystemCategories(U, T0);
    addExpense(U, { categoryId: category.id, amountKurus: k(15000) }, 4, T0 + 2000);
    addRecurringExpense(U, {
      categoryId: category.id, name: 'Plaka kirası', amountKurus: k(300000),
      period: 'monthly', startDate: '2026-09-01' as BusinessDate,
    }, T0);
    setGoal(U, k(150000), 'daily', T0);

    const fuel = addFuelLog(U, {
      vehicleId: vehicle.id, fuelType: 'lpg', totalAmountKurus: k(100000),
      unitPriceKurus: k(2150), volumePer1000: 46511.627, odometerKm: 150100.5,
    }, 4, T0 + 3000);
    updateFuelLog(U, fuel.id, { volumePer1000: 46000.4, odometerKm: 150200.5 }, T0 + 3500);

    // Vardiya sonu: "238,5" km, 7,4995 lt/100km, 1 saat 30,4 dakika.
    endShift(U, shift.id, {
      distanceKm: 238.5, workedMinutes: 90.4, fuelConsumptionPer100Km: 7499.5,
      fuelPriceKurus: k(4550), commissionKurus: k(21550),
    }, T0 + 4000);
    updateShiftTotals(U, shift.id, {
      distanceKm: 241.49, workedMinutes: 95.5, fuelConsumptionPer100Km: 7100.2,
    }, T0 + 5000);
    rememberStatedFuelFigures(U, vehicle.id, 6800.5, k(4600), T0 + 6000);

    assert.deepEqual(violations(), []);

    const row = rawTestDb().prepare(
      'SELECT distance_km, worked_minutes, fuel_consumption_per_100km FROM shifts',
    ).get();
    // Sıfırdan uzağa yarım: 241,49 → 241, 95,5 → 96, 7100,2 → 7100.
    assert.deepEqual({ ...row }, {
      distance_km: 241, worked_minutes: 96, fuel_consumption_per_100km: 7100,
    });
  });

  it('sıfıra yuvarlanan kilometre "bilinmiyor" kalır, 0 yazılmaz', () => {
    const vehicle = createVehicle(U, { label: 'Araç', ownership: 'owned', fuelTypes: ['gasoline'] }, T0);
    const shift = startShift(U, vehicle.id, 4, T0);
    endShift(U, shift.id, { distanceKm: 0.4 }, T0 + 1000);
    const row = rawTestDb().prepare('SELECT distance_km FROM shifts').get();
    assert.equal(row?.distance_km, null);
  });
});
