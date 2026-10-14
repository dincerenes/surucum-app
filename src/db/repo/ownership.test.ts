/**
 * Hesap sahipliği — aynı cihazda iki hesap.
 *
 * Çıkışta yerel veri hesap başına SAKLANIYOR; yani B oturumundayken A'nın
 * satırları aynı veritabanında duruyor. Ekranlar kimliği URL'den alıyor
 * ve derin bağlantı o rotaları dışarıdan da açabiliyor. Buradaki her vaka
 * bilinen bir yabancı kimlikle repo katmanını çağırıyor ve hiçbir satırın,
 * hiçbir kuyruk kaydının değişmediğini denetliyor.
 *
 * Gerçek repo fonksiyonları ve gerçek migration'lar, node:sqlite üzerinde.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  ForeignRecordError, SYNCED_TABLES, activateVehicle, addExpense, addFuelLog,
  addRecurringExpense, addRide, createEarningSource, createExpenseCategory, createVehicle,
  deactivateVehicle, deleteEarningSource, deleteExpense, deleteFuelLog, deleteGoal,
  deleteRecurringExpense, deleteRide, deleteShift, endShift, getDaySummary, getEarningSource,
  getExpense, getFuelLog, getKnownFuelFigures, getRide, getSettings, getShift, getVehicle,
  hideExpenseCategory, listFuelLogsForVehicle, listRidesInShift, listVehicleFuelTypes,
  seedSystemCategories, setGoal, setVehicleFuelTypes, startShift, updateEarningSource,
  updateExpense, updateFuelLog, updateRecurringExpense, updateRide, updateSettings,
  updateShiftTotals, updateVehicle,
} from '@/db/repo';
import type { Kurus } from '@/lib/money';
import type { BusinessDate } from '@/lib/business-date';
import { rawTestDb, resetTestDb } from '../../../tools/test-db.ts';

const A = '0199a000-0000-7000-8000-00000000000a';
const B = '0199b000-0000-7000-8000-00000000000b';
const GHOST = '0199ffff-0000-7000-8000-000000000000';

/** 18 Eylül 2026, öğlen — kesmeden uzak, gün tartışmasız. */
const T0 = new Date(2026, 8, 18, 12, 0).getTime();

const k = (n: number) => n as Kurus;

/** A hesabının her tabloda en az bir satırı. Kuyruk sonunda boşaltılır. */
function seedAccountA() {
  const vehicle = createVehicle(A, {
    label: 'A aracı', ownership: 'owned', fuelTypes: ['gasoline'],
  }, T0);
  const source = createEarningSource(A, { name: 'Sefer geliri' }, T0);
  const shift = startShift(A, vehicle.id, 4, T0);
  const ride = addRide(A, {
    grossAmountKurus: k(25050), shiftId: shift.id,
    vehicleId: vehicle.id, earningSourceId: source.id,
  }, 4, T0 + 1000);
  const [category] = seedSystemCategories(A, T0);
  const expense = addExpense(A, {
    categoryId: category.id, amountKurus: k(15000), vehicleId: vehicle.id,
  }, 4, T0 + 2000);
  const fuel = addFuelLog(A, {
    vehicleId: vehicle.id, fuelType: 'gasoline',
    totalAmountKurus: k(100000), unitPriceKurus: k(5000), volumePer1000: 20000,
  }, 4, T0 + 3000);
  const recurring = addRecurringExpense(A, {
    categoryId: category.id, name: 'Plaka kirası', amountKurus: k(300000),
    period: 'monthly', startDate: '2026-09-01' as BusinessDate,
  }, T0);
  const goal = setGoal(A, k(150000), 'daily', T0);
  assert.ok(goal);
  updateSettings(A, { defaultVehicleId: vehicle.id }, T0);

  rawTestDb().exec('DELETE FROM outbox');
  return { vehicle, source, shift, ride, category, expense, fuel, recurring, goal };
}

type Seeded = ReturnType<typeof seedAccountA>;

/** Senkronlanan tabloların ve kuyruğun tamamı — birebir karşılaştırma için. */
function snapshot(): string {
  const db = rawTestDb();
  const out: Record<string, unknown[]> = {};
  for (const table of [...SYNCED_TABLES, 'outbox']) {
    out[table] = db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all().map((r) => ({ ...r }));
  }
  return JSON.stringify(out);
}

function queue() {
  return rawTestDb().prepare('SELECT table_name, row_id, user_id, operation FROM outbox ORDER BY id')
    .all().map((r) => ({ ...r }));
}

/** Tek kayda dokunan her mutasyon — hepsi aynı kimlik kümesiyle. */
function mutations(userId: string, ids: Record<keyof Seeded, string>) {
  return {
    updateRide: () => updateRide(userId, ids.ride, { grossAmountKurus: k(1) }),
    deleteRide: () => deleteRide(userId, ids.ride),
    endShift: () => endShift(userId, ids.shift, { distanceKm: 100 }),
    updateShiftTotals: () => updateShiftTotals(userId, ids.shift, { distanceKm: 100 }),
    deleteShift: () => deleteShift(userId, ids.shift),
    hideExpenseCategory: () => hideExpenseCategory(userId, ids.category),
    updateExpense: () => updateExpense(userId, ids.expense, { amountKurus: k(1) }),
    deleteExpense: () => deleteExpense(userId, ids.expense),
    updateRecurringExpense: () => updateRecurringExpense(userId, ids.recurring, { amountKurus: k(1) }),
    deleteRecurringExpense: () => deleteRecurringExpense(userId, ids.recurring),
    updateFuelLog: () => updateFuelLog(userId, ids.fuel, { totalAmountKurus: k(1) }),
    deleteFuelLog: () => deleteFuelLog(userId, ids.fuel),
    updateVehicle: () => updateVehicle(userId, ids.vehicle, { ownership: 'rented_vehicle' }),
    setVehicleFuelTypes: () => setVehicleFuelTypes(userId, ids.vehicle, ['diesel']),
    deactivateVehicle: () => deactivateVehicle(userId, ids.vehicle),
    activateVehicle: () => activateVehicle(userId, ids.vehicle),
    updateEarningSource: () => updateEarningSource(userId, ids.source, { name: 'x' }),
    deleteEarningSource: () => deleteEarningSource(userId, ids.source),
    deleteGoal: () => deleteGoal(userId, ids.goal),
  };
}

function idsOf(a: Seeded): Record<keyof Seeded, string> {
  return Object.fromEntries(
    Object.entries(a).map(([key, row]) => [key, (row as { id: string }).id]),
  ) as Record<keyof Seeded, string>;
}

describe('yabancı kimlik — B oturumunda A\'nın kaydı', () => {
  let a: Seeded;
  let before: string;

  beforeEach(() => {
    resetTestDb();
    a = seedAccountA();
    before = snapshot();
  });

  it('tekil okumalar yabancı kaydı getirmez, sahibine getirir', () => {
    assert.equal(getRide(B, a.ride.id), undefined);
    assert.equal(getShift(B, a.shift.id), undefined);
    assert.equal(getExpense(B, a.expense.id), undefined);
    assert.equal(getFuelLog(B, a.fuel.id), undefined);
    assert.equal(getVehicle(B, a.vehicle.id), undefined);
    assert.equal(getEarningSource(B, a.source.id), undefined);

    assert.equal(getRide(A, a.ride.id)?.id, a.ride.id);
    assert.equal(getShift(A, a.shift.id)?.id, a.shift.id);
    assert.equal(getExpense(A, a.expense.id)?.id, a.expense.id);
    assert.equal(getFuelLog(A, a.fuel.id)?.id, a.fuel.id);
    assert.equal(getVehicle(A, a.vehicle.id)?.id, a.vehicle.id);
    assert.equal(getEarningSource(A, a.source.id)?.id, a.source.id);
  });

  it('listeler ve ön dolgu yabancı araçtan, yabancı vardiyadan okumaz', () => {
    assert.deepEqual(listRidesInShift(B, a.shift.id), []);
    assert.deepEqual(listVehicleFuelTypes(B, a.vehicle.id), []);
    assert.deepEqual(listFuelLogsForVehicle(B, a.vehicle.id), []);
    assert.deepEqual(getKnownFuelFigures(B, a.vehicle.id), {
      consumptionPer100Km: null, unitPriceKurus: null, isMeasured: false,
    });

    assert.equal(listRidesInShift(A, a.shift.id).length, 1);
    assert.equal(listVehicleFuelTypes(A, a.vehicle.id).length, 1);
    assert.equal(getKnownFuelFigures(A, a.vehicle.id).unitPriceKurus, 5000);
  });

  for (const name of Object.keys(mutations(B, {} as never))) {
    it(`${name}: false döner, hiçbir satır ve kuyruk değişmez`, () => {
      const run = mutations(B, idsOf(a))[name as keyof ReturnType<typeof mutations>];
      assert.equal(run(), false);
      assert.equal(snapshot(), before);
    });
  }
});

describe('var olmayan ya da silinmiş kayıt', () => {
  beforeEach(() => resetTestDb());

  it('var olmayan kimlik: her mutasyon false, kuyruk boş', () => {
    seedAccountA();
    const before = snapshot();
    const ghostIds = new Proxy({}, { get: () => GHOST }) as Record<keyof Seeded, string>;
    for (const [name, run] of Object.entries(mutations(A, ghostIds))) {
      assert.equal(run(), false, name);
    }
    assert.equal(snapshot(), before);
    assert.deepEqual(queue(), []);
  });

  it('silinmiş kayıt okunmaz, düzeltilmez, ikinci kez silinmez', () => {
    const a = seedAccountA();
    assert.equal(deleteRide(A, a.ride.id, T0 + 5000), true);
    const afterDelete = snapshot();

    assert.equal(getRide(A, a.ride.id), undefined);
    assert.equal(updateRide(A, a.ride.id, { grossAmountKurus: k(1) }), false);
    assert.equal(deleteRide(A, a.ride.id, T0 + 6000), false);
    assert.equal(snapshot(), afterDelete);
    assert.deepEqual(queue(), [
      { table_name: 'rides', row_id: a.ride.id, user_id: A, operation: 'delete' },
    ]);
  });
});

describe('ilişkiler — yabancı kayda bağlanılamaz', () => {
  let a: Seeded;
  let before: string;

  beforeEach(() => {
    resetTestDb();
    a = seedAccountA();
    before = snapshot();
  });

  it('sefer yabancı vardiyaya, araca ya da kaynağa bağlanamaz; iz bırakmaz', () => {
    for (const link of [
      { shiftId: a.shift.id }, { vehicleId: a.vehicle.id }, { earningSourceId: a.source.id },
    ]) {
      assert.throws(
        () => addRide(B, { grossAmountKurus: k(1000), ...link }, 4, T0),
        ForeignRecordError, JSON.stringify(link),
      );
    }
    // B'nin varsayılan kaynağı bile açılmadı: denetim her yazmadan önce.
    assert.equal(snapshot(), before);
  });

  it('silinmiş vardiyaya bağlanan sefer kendi saatinden gün ALMAZ, reddedilir', () => {
    deleteShift(A, a.shift.id, T0 + 5000);
    assert.throws(
      () => addRide(A, { grossAmountKurus: k(1000), shiftId: a.shift.id }, 4, T0 + 6000),
      ForeignRecordError,
    );
  });

  it('vardiya yabancı araçla açılamaz', () => {
    assert.throws(() => startShift(B, a.vehicle.id, 4, T0), ForeignRecordError);
    assert.equal(snapshot(), before);
  });

  it('gider ve dönemsel gider yabancı kategori ya da araçla eklenemez', () => {
    const own = createExpenseCategory(B, { name: 'Kendi' }, T0);
    const afterOwn = snapshot();
    assert.throws(() => addExpense(B, {
      categoryId: a.category.id, amountKurus: k(1000),
    }, 4, T0), ForeignRecordError);
    assert.throws(() => addExpense(B, {
      categoryId: own.id, amountKurus: k(1000), vehicleId: a.vehicle.id,
    }, 4, T0), ForeignRecordError);
    assert.throws(() => addRecurringExpense(B, {
      categoryId: a.category.id, name: 'x', amountKurus: k(1000),
      period: 'monthly', startDate: '2026-09-01' as BusinessDate,
    }, T0), ForeignRecordError);
    assert.equal(snapshot(), afterOwn);
  });

  it('dolum yabancı araca yazılamaz; yabancı aracın fiyatı değişmez', () => {
    assert.throws(() => addFuelLog(B, {
      vehicleId: a.vehicle.id, fuelType: 'gasoline',
      totalAmountKurus: k(1000), unitPriceKurus: k(9999), volumePer1000: 100,
    }, 4, T0), ForeignRecordError);
    assert.equal(snapshot(), before);
  });

  it('varsayılan araç yabancı olamaz; ayar satırı bile açılmaz', () => {
    assert.throws(
      () => updateSettings(B, { defaultVehicleId: a.vehicle.id }, T0),
      ForeignRecordError,
    );
    assert.throws(
      () => updateSettings(B, { defaultEarningSourceId: a.source.id }, T0),
      ForeignRecordError,
    );
    assert.equal(getSettings(B), undefined);
    assert.equal(snapshot(), before);
  });

  it('düzeltmede YENİ bağ denetlenir, değişmeyen eski bağ denetlenmez', () => {
    const vehicle = createVehicle(B, { label: 'B', ownership: 'owned', fuelTypes: ['diesel'] }, T0);
    const shift = startShift(B, vehicle.id, 4, T0);
    const category = createExpenseCategory(B, { name: 'Kendi' }, T0);
    const expense = addExpense(B, { categoryId: category.id, amountKurus: k(1000) }, 4, T0);
    const ride = addRide(B, { grossAmountKurus: k(1000), shiftId: shift.id }, 4, T0);

    assert.throws(
      () => updateExpense(B, expense.id, { categoryId: a.category.id }, T0 + 1),
      ForeignRecordError,
    );
    assert.throws(
      () => updateExpense(B, expense.id, { vehicleId: a.vehicle.id }, T0 + 1),
      ForeignRecordError,
    );
    assert.throws(
      () => updateRide(B, ride.id, { earningSourceId: a.source.id }, T0 + 1),
      ForeignRecordError,
    );

    /**
     * Eski sürümden kalmış yabancı bağ: tutarı düzeltmek bu yüzden
     * reddedilmemeli — sürücü kaydını düzeltemez hâle gelirdi.
     */
    rawTestDb().prepare('UPDATE expenses SET category_id = ? WHERE id = ?')
      .run(a.category.id, expense.id);
    assert.equal(updateExpense(B, expense.id, {
      amountKurus: k(2000), categoryId: a.category.id,
    }, T0 + 2), true);
    assert.equal(getExpense(B, expense.id)?.amountKurus, 2000);
  });
});

describe('yabancı araca bağlı kalmış vardiya (eski sürümden)', () => {
  beforeEach(() => resetTestDb());

  it('gün özeti yabancı aracın yıpranma oranını okumaz', () => {
    const a = seedAccountA();
    const rented = createVehicle(B, {
      label: 'B kiralık', ownership: 'rented_vehicle', fuelTypes: ['diesel'],
    }, T0);
    const shift = startShift(B, rented.id, 4, T0);
    endShift(B, shift.id, { distanceKm: 100 }, T0 + 1000);
    const date = shift.businessDate;

    // Kontrol: kendi kiralık aracında pay sıfır.
    assert.equal(getDaySummary(B, date, T0 + 2000).profit.wearShare, 0);

    rawTestDb().prepare('UPDATE shifts SET vehicle_id = ? WHERE id = ?').run(a.vehicle.id, shift.id);
    const summary = getDaySummary(B, date, T0 + 2000);
    assert.equal(summary.profit.wearShare, 0, 'A\'nın 100 kuruşu B\'nin kârından düşülmemeli');
    assert.equal(summary.distanceKm, 100);

    // A'nın kendi vardiyası kendi aracının oranıyla hesaplanmaya devam eder.
    endShift(A, a.shift.id, { distanceKm: 100 }, T0 + 1000);
    assert.equal(getDaySummary(A, a.shift.businessDate, T0 + 2000).profit.wearShare, 10000);
  });

  it('vardiya kapanışı yabancı aracın yakıt bilgisine dokunmaz', () => {
    const a = seedAccountA();
    const own = createVehicle(B, { label: 'B', ownership: 'owned', fuelTypes: ['diesel'] }, T0);
    const shift = startShift(B, own.id, 4, T0);
    rawTestDb().prepare('UPDATE shifts SET vehicle_id = ? WHERE id = ?').run(a.vehicle.id, shift.id);
    rawTestDb().exec('DELETE FROM outbox');
    const aFuelBefore = JSON.stringify(listVehicleFuelTypes(A, a.vehicle.id));

    assert.equal(endShift(B, shift.id, {
      distanceKm: 100, fuelConsumptionPer100Km: 9000, fuelPriceKurus: k(4500),
    }, T0 + 1000), true);

    assert.equal(JSON.stringify(listVehicleFuelTypes(A, a.vehicle.id)), aFuelBefore);
    assert.deepEqual(queue(), [
      { table_name: 'shifts', row_id: shift.id, user_id: B, operation: 'upsert' },
    ]);
  });
});

describe('kendi kaydı — eski davranış sürer', () => {
  beforeEach(() => resetTestDb());

  it('her mutasyon true döner ve kaydı tam bir kez kuyruğa koyar', () => {
    const a = seedAccountA();
    const ids = idsOf(a);
    const run = mutations(A, ids);

    const expectations: [keyof typeof run, string, string, 'upsert' | 'delete'][] = [
      ['updateRide', 'rides', ids.ride, 'upsert'],
      ['endShift', 'shifts', ids.shift, 'upsert'],
      ['updateShiftTotals', 'shifts', ids.shift, 'upsert'],
      ['hideExpenseCategory', 'expense_categories', ids.category, 'upsert'],
      ['updateExpense', 'expenses', ids.expense, 'upsert'],
      ['updateRecurringExpense', 'recurring_expenses', ids.recurring, 'upsert'],
      ['updateFuelLog', 'fuel_logs', ids.fuel, 'upsert'],
      ['updateVehicle', 'vehicles', ids.vehicle, 'upsert'],
      ['deactivateVehicle', 'vehicles', ids.vehicle, 'upsert'],
      ['activateVehicle', 'vehicles', ids.vehicle, 'upsert'],
      ['updateEarningSource', 'earning_sources', ids.source, 'upsert'],
      ['deleteRide', 'rides', ids.ride, 'delete'],
      ['deleteExpense', 'expenses', ids.expense, 'delete'],
      ['deleteRecurringExpense', 'recurring_expenses', ids.recurring, 'delete'],
      ['deleteFuelLog', 'fuel_logs', ids.fuel, 'delete'],
      ['deleteShift', 'shifts', ids.shift, 'delete'],
      ['deleteEarningSource', 'earning_sources', ids.source, 'delete'],
      ['deleteGoal', 'goals', ids.goal, 'delete'],
    ];

    for (const [name, table, rowId, operation] of expectations) {
      rawTestDb().exec('DELETE FROM outbox');
      assert.equal(run[name](), true, name);
      const rows = queue().filter((q) => q.table_name === table && q.row_id === rowId);
      assert.deepEqual(rows, [{ table_name: table, row_id: rowId, user_id: A, operation }], name);
    }
  });

  it('düzeltmeler satıra işler; sahiplik değişince yıpranma da değişir', () => {
    const a = seedAccountA();
    updateRide(A, a.ride.id, { grossAmountKurus: k(30000) }, T0 + 10);
    assert.equal(getRide(A, a.ride.id)?.grossAmountKurus, 30000);
    assert.equal(getRide(A, a.ride.id)?.updatedAt, T0 + 10);

    updateVehicle(A, a.vehicle.id, { ownership: 'rented_vehicle' }, T0 + 10);
    assert.equal(getVehicle(A, a.vehicle.id)?.wearPerKmKurus, 0);

    assert.equal(setVehicleFuelTypes(A, a.vehicle.id, ['lpg', 'gasoline'], T0 + 10), true);
    assert.deepEqual(
      listVehicleFuelTypes(A, a.vehicle.id).map((f) => [f.fuelType, f.isPrimary]),
      // Birincil başta: yakıt ekranının varsayılan çipi listenin ilki.
      [['lpg', true], ['gasoline', false]],
    );

    // Kapanıştaki beyan aracın kendi yakıt satırına hatırlatılır.
    endShift(A, a.shift.id, { fuelConsumptionPer100Km: 7500, fuelPriceKurus: k(4800) }, T0 + 20);
    assert.deepEqual(getKnownFuelFigures(A, a.vehicle.id), {
      consumptionPer100Km: 7500, unitPriceKurus: 4800, isMeasured: false,
    });
  });
});
