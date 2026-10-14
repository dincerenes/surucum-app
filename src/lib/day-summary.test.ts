import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateDaySummary } from './day-summary.ts';
import { type Kurus, fromLira } from './money.ts';
import { defaultWearPerKm } from '../db/schema/_shared.ts';

const k = (lira: number) => fromLira(lira);
const T0 = 1_787_700_000_000;
const H = 3_600_000;

const ride = (gross: number, commission: number, tip = 0) => ({
  grossAmountKurus: k(gross),
  commissionKurus: k(commission),
  tipKurus: k(tip),
});

const shift = (o: Partial<{
  startedAt: number; endedAt: number | null;
  workedMinutes: number | null; distanceKm: number | null;
}> = {}) => ({
  startedAt: T0, endedAt: null, workedMinutes: null, distanceKm: null, ...o,
});

describe('calculateDaySummary', () => {
  it('kiralık plakalı sürücünün tam bir günü', () => {
    const s = calculateDaySummary({
      rides: Array.from({ length: 14 }, () => ride(165, 41.25)),
      expenses: [{ amountKurus: k(150) }],
      fuelLogs: [{ totalAmountKurus: k(1100) }],
      shifts: [shift({ endedAt: T0 + 8 * H, workedMinutes: 462, distanceKm: 280 })],
      wearPerKmKurus: defaultWearPerKm('rented_plate'),
      fixedShare: k(1200),
      now: T0 + 9 * H,
    });

    assert.equal(s.profit.revenue, k(2310));
    assert.equal(s.profit.commission, k(577.5));
    assert.equal(s.profit.cashProfit, k(482.5));
    assert.equal(s.profit.wearShare, k(700));      // 280 km × 2,50 ₺
    assert.equal(s.profit.trueProfit, k(-1417.5));

    // Cebinde para var ama gün zararda — ürünün varlık sebebi
    assert.ok(s.profit.cashProfit > 0);
    assert.ok(s.profit.trueProfit < 0);

    assert.equal(s.rideCount, 14);
    assert.equal(s.distanceKm, 280);
    assert.equal(s.durationMinutes, 462);
    assert.equal(s.isDurationEstimated, false);
  });

  it('kilometre hiç girilmemişse yıpranma payı YOK, sıfır değil tahmin de değil', () => {
    const s = calculateDaySummary({
      rides: [ride(1000, 200)],
      expenses: [], fuelLogs: [],
      shifts: [shift({ endedAt: T0 + 5 * H })],
      wearPerKmKurus: defaultWearPerKm('owned'),
      now: T0 + 6 * H,
    });
    assert.equal(s.distanceKm, null);
    assert.equal(s.profit.wearShare, 0);
    assert.equal(s.perKm, null);
    assert.equal(s.shiftsMissingDistance, 1);
    // Eksik değil, hiç yok — kısmi damgası vurulmaz
    assert.equal(s.profit.isDistanceEstimated, false);
  });

  it('bazı vardiyaların kilometresi eksikse toplam KISMİ damgalanır', () => {
    const s = calculateDaySummary({
      rides: [ride(1000, 0)],
      expenses: [], fuelLogs: [],
      shifts: [
        shift({ endedAt: T0 + 4 * H, distanceKm: 120 }),
        shift({ startedAt: T0 + 6 * H, endedAt: T0 + 10 * H }),
      ],
      wearPerKmKurus: defaultWearPerKm('owned'),
      now: T0 + 11 * H,
    });
    assert.equal(s.distanceKm, 120);
    assert.equal(s.shiftsMissingDistance, 1);
    assert.equal(s.profit.isDistanceEstimated, true);
    assert.equal(s.profit.wearShare, k(300)); // 120 km × 2,50 ₺
  });

  it('kiralık araçta yıpranma sıfır — kira zaten sabit giderde sayılıyor', () => {
    const s = calculateDaySummary({
      rides: [ride(2000, 400)],
      expenses: [], fuelLogs: [],
      shifts: [shift({ endedAt: T0 + 8 * H, distanceKm: 300 })],
      wearPerKmKurus: defaultWearPerKm('rented_vehicle'),
      fixedShare: k(500),
      now: T0 + 9 * H,
    });
    assert.equal(s.profit.wearShare, 0);
    assert.equal(s.profit.trueProfit, k(1100)); // 1600 − 500
  });

  it('birden fazla vardiya toplanır', () => {
    const s = calculateDaySummary({
      rides: [ride(500, 100), ride(700, 140)],
      expenses: [], fuelLogs: [],
      shifts: [
        shift({ endedAt: T0 + 4 * H, workedMinutes: 240, distanceKm: 90 }),
        shift({ startedAt: T0 + 6 * H, endedAt: T0 + 9 * H, workedMinutes: 180, distanceKm: 70 }),
      ],
      wearPerKmKurus: defaultWearPerKm('owned'),
      now: T0 + 10 * H,
    });
    assert.equal(s.distanceKm, 160);
    assert.equal(s.durationMinutes, 420);
    assert.equal(s.isDurationEstimated, false);
    assert.equal(s.shiftsMissingDistance, 0);
  });

  it('bir vardiya bile damgadan türetilmişse gün tahmini sayılır', () => {
    const s = calculateDaySummary({
      rides: [ride(500, 0)],
      expenses: [], fuelLogs: [],
      shifts: [
        shift({ endedAt: T0 + 4 * H, workedMinutes: 240 }),
        shift({ startedAt: T0 + 6 * H, endedAt: T0 + 9 * H }),
      ],
      now: T0 + 10 * H,
    });
    assert.equal(s.isDurationEstimated, true);
  });

  it('vardiyasız gün — sefer var, vardiya yok', () => {
    const s = calculateDaySummary({
      rides: [ride(300, 60)],
      expenses: [], fuelLogs: [], shifts: [],
      now: T0,
    });
    assert.equal(s.profit.cashProfit, k(240));
    assert.equal(s.durationMinutes, 0);
    assert.equal(s.distanceKm, null);
    assert.equal(s.perHour, null);
    assert.equal(s.perKm, null);
    assert.equal(s.perRide, k(240));
  });

  it('boş gün hiçbir yerde patlamaz', () => {
    const s = calculateDaySummary({
      rides: [], expenses: [], fuelLogs: [], now: T0,
    });
    assert.equal(s.profit.revenue, 0);
    assert.equal(s.profit.cashProfit, 0);
    assert.equal(s.profit.trueProfit, 0);
    assert.equal(s.rideCount, 0);
    assert.equal(s.perRide, null);
  });

  it('bahşiş ciroya girer ama komisyona girmez', () => {
    const s = calculateDaySummary({
      rides: [ride(200, 50, 30)],
      expenses: [], fuelLogs: [], now: T0,
    });
    assert.equal(s.profit.revenue, k(230));
    assert.equal(s.profit.commission, k(50));
    assert.equal(s.profit.cashProfit, k(180));
  });

  it('oranların paydası cebe kalan — ciro değil', () => {
    const s = calculateDaySummary({
      rides: [ride(1000, 200)],
      expenses: [], fuelLogs: [{ totalAmountKurus: k(300) }],
      shifts: [shift({ endedAt: T0 + 5 * H, workedMinutes: 300, distanceKm: 100 })],
      now: T0 + 6 * H,
    });
    assert.equal(s.profit.cashProfit, k(500));
    assert.equal(s.perHour, k(100));  // 500 / 5 saat
    assert.equal(s.perKm, k(5));      // 500 / 100 km
  });

  it('bir vardiyanın km\'si boşsa ₺/km YOK — günün bütün parası yarım km\'ye bölünmez', () => {
    const s = calculateDaySummary({
      rides: [ride(1000, 0), ride(1000, 0)],
      expenses: [], fuelLogs: [],
      shifts: [
        shift({ endedAt: T0 + 4 * H, workedMinutes: 240, distanceKm: 100 }),
        shift({ startedAt: T0 + 5 * H, endedAt: T0 + 9 * H, workedMinutes: 240 }),
      ],
      now: T0 + 10 * H,
    });
    assert.equal(s.distanceKm, 100);
    assert.equal(s.perKm, null);          // eskiden 2000 / 100 = 20 ₺/km
    assert.equal(s.perHour, k(250));      // süre iki vardiyada da belli
  });

  it('açık vardiya varken ₺/saat ve ₺/km YOK — parası var, süresi ve km\'si yok', () => {
    const s = calculateDaySummary({
      rides: [ride(1000, 0), ride(1000, 0)],
      expenses: [], fuelLogs: [],
      shifts: [
        shift({ endedAt: T0 + 4 * H, workedMinutes: 240, distanceKm: 100 }),
        shift({ startedAt: T0 + 5 * H }),
      ],
      now: T0 + 6 * H,
    });
    assert.equal(s.perHour, null);        // eskiden 2000 / 4 saat = 500 ₺/saat
    assert.equal(s.perKm, null);
  });

  it('dönen her tutar tam sayı kalır', () => {
    const s = calculateDaySummary({
      rides: [ride(187.5, 32.81), ride(99.99, 17.5)],
      expenses: [{ amountKurus: k(13.37) }],
      fuelLogs: [{ totalAmountKurus: k(77.77) }],
      shifts: [shift({ endedAt: T0 + 3 * H, distanceKm: 47.3 })],
      wearPerKmKurus: defaultWearPerKm('owned'),
      fixedShare: k(41.67),
      now: T0 + 4 * H,
    });
    for (const v of Object.values(s.profit)) {
      if (typeof v === 'number') assert.ok(Number.isInteger(v));
    }
    for (const v of [s.perHour, s.perKm, s.perRide]) {
      if (v !== null) assert.ok(Number.isInteger(v));
    }
  });
});

describe('çok araçlı gün', () => {
  it('her vardiyanın yıpranma payı KENDİ aracının oranıyla hesaplanır', () => {
    const s = calculateDaySummary({
      rides: [ride(2000, 0)],
      expenses: [], fuelLogs: [],
      shifts: [
        // Kendi aracı: 200 km × 2,50 ₺ = 500 ₺
        { ...shift({ endedAt: T0 + 5 * H, distanceKm: 200 }),
          wearPerKmKurus: defaultWearPerKm('owned') },
        // Kiralık araç: 150 km × 0 = 0 ₺
        { ...shift({ startedAt: T0 + 7 * H, endedAt: T0 + 11 * H, distanceKm: 150 }),
          wearPerKmKurus: defaultWearPerKm('rented_vehicle') },
      ],
      now: T0 + 12 * H,
    });
    assert.equal(s.distanceKm, 350);
    assert.equal(s.profit.wearShare, k(500));
    // Toplam kilometreye tek oran uygulansaydı 350 × 2,50 = 875 çıkardı
    assert.notEqual(s.profit.wearShare, k(875));
  });

  it('vardiyanın kendi oranı yoksa gün geneli orana düşülür', () => {
    const s = calculateDaySummary({
      rides: [ride(1000, 0)],
      expenses: [], fuelLogs: [],
      shifts: [shift({ endedAt: T0 + 5 * H, distanceKm: 100 })],
      wearPerKmKurus: defaultWearPerKm('owned'),
      now: T0 + 6 * H,
    });
    assert.equal(s.profit.wearShare, k(250));
  });

  it('vardiyanın kendi oranı gün geneli oranı EZER', () => {
    const s = calculateDaySummary({
      rides: [ride(1000, 0)],
      expenses: [], fuelLogs: [],
      shifts: [
        { ...shift({ endedAt: T0 + 5 * H, distanceKm: 100 }),
          wearPerKmKurus: defaultWearPerKm('employer') },
      ],
      wearPerKmKurus: defaultWearPerKm('owned'),
      now: T0 + 6 * H,
    });
    assert.equal(s.profit.wearShare, 0);
  });
});

describe('komisyon vardiya sonunda tek rakam', () => {
  it('vardiyaya yazılan komisyon cebe kalandan düşer', () => {
    const s = calculateDaySummary({
      rides: [ride(1000, 0), ride(500, 0)],   // seferlerde komisyon yok
      expenses: [], fuelLogs: [],
      shifts: [{
        ...shift({ endedAt: T0 + 8 * H, workedMinutes: 480 }),
        commissionKurus: k(340),
      }],
      now: T0 + 9 * H,
    });
    assert.equal(s.profit.revenue, k(1500));
    assert.equal(s.profit.commission, k(340));
    assert.equal(s.profit.cashProfit, k(1160));
  });

  it('komisyon girilmemişse sıfır sayılır, tahmin edilmez', () => {
    const s = calculateDaySummary({
      rides: [ride(1000, 0)],
      expenses: [], fuelLogs: [],
      shifts: [shift({ endedAt: T0 + 5 * H })],
      now: T0 + 6 * H,
    });
    assert.equal(s.profit.commission, 0);
    assert.equal(s.profit.cashProfit, k(1000));
  });

  it('negatif komisyon geliri BÜYÜTMEZ', () => {
    const s = calculateDaySummary({
      rides: [ride(1000, 0)],
      expenses: [], fuelLogs: [],
      shifts: [{ ...shift({ endedAt: T0 + 5 * H }), commissionKurus: k(-500) }],
      now: T0 + 6 * H,
    });
    assert.equal(s.profit.commission, 0);
    assert.equal(s.profit.cashProfit, k(1000));
  });

  it('birden fazla vardiyanın komisyonu toplanır', () => {
    const s = calculateDaySummary({
      rides: [ride(2000, 0)],
      expenses: [], fuelLogs: [],
      shifts: [
        { ...shift({ endedAt: T0 + 4 * H }), commissionKurus: k(200) },
        { ...shift({ startedAt: T0 + 6 * H, endedAt: T0 + 10 * H }), commissionKurus: k(150) },
      ],
      now: T0 + 11 * H,
    });
    assert.equal(s.profit.commission, k(350));
  });

  it('sefer komisyonu ile vardiya komisyonu birlikte toplanır', () => {
    // v1'de sefer komisyonu daima sıfır; kapının açık kaldığını doğruluyoruz
    const s = calculateDaySummary({
      rides: [ride(1000, 50)],
      expenses: [], fuelLogs: [],
      shifts: [{ ...shift({ endedAt: T0 + 5 * H }), commissionKurus: k(100) }],
      now: T0 + 6 * H,
    });
    assert.equal(s.profit.commission, k(150));
  });
});

describe('yakıt tek sayı', () => {
  const gun = (tuketimVar: boolean, odenen = 0) => calculateDaySummary({
    rides: [ride(2000, 0)],
    expenses: [],
    fuelLogs: odenen > 0 ? [{ totalAmountKurus: k(odenen) }] : [],
    shifts: [{
      ...shift({ endedAt: T0 + 8 * H, workedMinutes: 480, distanceKm: 200 }),
      commissionKurus: k(400),
      wearPerKmKurus: defaultWearPerKm('owned'),
      ...(tuketimVar
        ? { fuelConsumptionPer100Km: 7500, fuelPriceKurus: k(50) }
        : {}),
    }],
    now: T0 + 9 * H,
  });

  it('tüketimden hesaplanıyor: 200 km × 7,5 lt × 50 ₺ = 750 ₺', () => {
    const s = gun(true);
    assert.equal(s.profit.fuelPaid, k(750));
    assert.equal(s.fuelVolume, 15000);
  });

  it('tek fark yıpranma: gerçek kâr = cebe kalan − yıpranma', () => {
    const s = gun(true);
    assert.equal(s.profit.cashProfit, k(850));    // 2000 − 400 − 750
    assert.equal(s.profit.wearShare, k(500));     // 200 km × 2,50
    assert.equal(s.profit.trueProfit, k(350));    // 850 − 500
    assert.equal(s.profit.trueProfit, s.profit.cashProfit - s.profit.wearShare);
  });

  it('tüketim girilmemişse kaydedilen dolum kullanılıyor', () => {
    const s = gun(false, 1000);
    assert.equal(s.profit.fuelPaid, k(1000));
    assert.equal(s.fuelVolume, null);
    assert.equal(s.profit.cashProfit, k(600));    // 2000 − 400 − 1000
    assert.equal(s.profit.trueProfit, k(100));    // 600 − 500
  });

  it('tüketim varsa dolum kaydı AYRICA sayılmıyor — iki kez düşülmez', () => {
    const s = gun(true, 1000);
    assert.equal(s.profit.fuelPaid, k(750));      // 1750 değil
    assert.equal(s.profit.cashProfit, k(850));
  });

  it('her vardiya kendi tüketimi ve fiyatıyla hesaplanır', () => {
    const s = calculateDaySummary({
      rides: [ride(3000, 0)],
      expenses: [], fuelLogs: [],
      shifts: [
        { ...shift({ endedAt: T0 + 4 * H, distanceKm: 100 }),
          fuelConsumptionPer100Km: 7500, fuelPriceKurus: k(50) },   // 375 ₺
        { ...shift({ startedAt: T0 + 6 * H, endedAt: T0 + 10 * H, distanceKm: 100 }),
          fuelConsumptionPer100Km: 12000, fuelPriceKurus: k(22) },  // 264 ₺
      ],
      now: T0 + 11 * H,
    });
    assert.equal(s.profit.fuelPaid, k(639));
    assert.equal(s.fuelVolume, 19500);
  });

  it('mesafe yoksa yakıt hesaplanmaz, dolum kaydına düşülür', () => {
    const s = calculateDaySummary({
      rides: [ride(1000, 0)],
      expenses: [], fuelLogs: [{ totalAmountKurus: k(300) }],
      shifts: [{
        ...shift({ endedAt: T0 + 5 * H }),
        fuelConsumptionPer100Km: 7500, fuelPriceKurus: k(50),
      }],
      now: T0 + 6 * H,
    });
    assert.equal(s.fuelVolume, null);
    assert.equal(s.profit.fuelPaid, k(300));
  });
});

describe('gece vardiyası gün ortasında bölünmez', () => {
  it('vardiyanın tüm seferleri tek güne toplanıyor', () => {
    /**
     * Bu testin koruduğu davranış: 22:00'de açılan vardiya sabah
     * 06:00'da kapanıyor. Seferler kendi saatlerinden gün alsaydı
     * gece yarısında ikiye bölünürdü. Repo katmanı sefere vardiyanın
     * iş gününü yazıyor; özet de o günü topluyor.
     */
    const s = calculateDaySummary({
      rides: [ride(300, 0), ride(400, 0), ride(500, 0)],
      expenses: [], fuelLogs: [],
      shifts: [{
        ...shift({ endedAt: T0 + 8 * H, workedMinutes: 480, distanceKm: 200 }),
        commissionKurus: k(200),
        wearPerKmKurus: defaultWearPerKm('owned'),
      }],
      now: T0 + 9 * H,
    });
    assert.equal(s.rideCount, 3);
    assert.equal(s.profit.revenue, k(1200));
    assert.equal(s.durationMinutes, 480);
  });
});

describe('yakıt vardiya başına tek sayı', () => {
  /** 100 km × 10 lt × 50 ₺ = 500 ₺ yakan kapanmış vardiya. */
  const burning = (id: string, vehicleId = 'V1') => ({
    ...shift({ endedAt: T0 + 4 * H, distanceKm: 100 }),
    id, vehicleId, commissionKurus: k(0),
    fuelConsumptionPer100Km: 10_000, fuelPriceKurus: k(50),
  });
  /** Tüketimi girilmemiş kapanmış vardiya. */
  const plain = (id: string, vehicleId = 'V1', o: { distanceKm?: number | null } = {}) => ({
    ...shift({ startedAt: T0 + 5 * H, endedAt: T0 + 9 * H, distanceKm: o.distanceKm ?? null }),
    id, vehicleId, commissionKurus: k(0),
  });
  const fill = (id: string, amount: number, o: { shiftId?: string; vehicleId?: string } = {}) => ({
    id, totalAmountKurus: k(amount), shiftId: o.shiftId ?? null, vehicleId: o.vehicleId ?? 'V1',
  });
  const day = (shifts: object[], fuelLogs: object[]) => calculateDaySummary({
    rides: [ride(2000, 0)], expenses: [],
    fuelLogs: fuelLogs as never, shifts: shifts as never, now: T0 + 10 * H,
  });

  it('aynı araçta A tüketimli, B bilinmiyor, vardiyasız dolum → yalnızca A; B eksik; dolum sayılmadı', () => {
    const s = day([burning('A'), plain('B')], [fill('f', 300)]);
    assert.equal(s.profit.fuelPaid, k(500));
    assert.equal(s.completeness.shiftsMissingFuel, 1);
    assert.deepEqual(s.completeness.fuelUnknownShiftIds, ['B']);
    assert.equal(s.completeness.fillsNotCountedKurus, k(300));
    assert.equal(s.fuelLogStatus.f, 'covered');
    assert.equal(s.completeness.fuel, 'partial');
    assert.equal(s.completeness.fuelSource, 'burned');
  });

  it('dolum B vardiyasına bağlıysa B\'nin yakıtı odur: 500 + 300', () => {
    const s = day([burning('A'), plain('B')], [fill('f', 300, { shiftId: 'B' })]);
    assert.equal(s.profit.fuelPaid, k(800));
    assert.equal(s.completeness.shiftsMissingFuel, 0);
    assert.equal(s.completeness.fuel, 'complete');
    assert.equal(s.completeness.fuelSource, 'mixed');
    assert.equal(s.fuelLogStatus.f, 'counted');
  });

  it('tüketimli vardiyaya bağlı dolum AYRICA düşülmez: 500, 1200 değil', () => {
    const s = day([burning('A')], [fill('f', 700, { shiftId: 'A' })]);
    assert.equal(s.profit.fuelPaid, k(500));
    assert.equal(s.completeness.fillsNotCountedKurus, k(700));
    assert.equal(s.fuelLogStatus.f, 'covered');
  });

  it('iki araç: V1 tüketimli, V2 tüketimsiz + V2 dolumu → 800', () => {
    const s = day([burning('A', 'V1'), plain('B', 'V2')], [fill('f', 300, { vehicleId: 'V2' })]);
    assert.equal(s.profit.fuelPaid, k(800));
    assert.equal(s.completeness.shiftsMissingFuel, 0, 'V2 vardiyası dolumla kapsandı');
  });

  it('iki araç: V2\'nin dolumu yoksa V2 vardiyası bilinmiyor', () => {
    const s = day([burning('A', 'V1'), plain('B', 'V2')], []);
    assert.equal(s.profit.fuelPaid, k(500));
    assert.equal(s.completeness.shiftsMissingFuel, 1);
  });

  it('silinmiş (listede olmayan) vardiyaya bağlı dolum vardiyasız sayılır', () => {
    const s = day([plain('B')], [fill('f', 300, { shiftId: 'silinmis' })]);
    assert.equal(s.profit.fuelPaid, k(300));
    assert.equal(s.fuelLogStatus.f, 'counted');
  });

  it('o gün o araçla hiç vardiya yoksa depo alımı maliyete GİRMEZ', () => {
    const s = calculateDaySummary({
      rides: [], expenses: [], fuelLogs: [fill('f', 1000)], shifts: [], now: T0,
    });
    assert.equal(s.profit.fuelPaid, 0);
    assert.equal(s.profit.cashProfit, 0);
    assert.equal(s.completeness.offDayFillsKurus, k(1000));
    assert.equal(s.fuelLogStatus.f, 'off_day');
    // Kayıt var, ama çalışılmış gün değil ve km eksik sayılmaz.
    assert.equal(s.hasActivity, true);
    assert.equal(s.isWorkedDay, false);
    assert.equal(s.completeness.distance, 'none');
  });

  it('başka araçla vardiya varsa da bu aracın dolumu gün dışıdır', () => {
    const s = day([plain('B', 'V1')], [fill('f', 400, { vehicleId: 'V2' })]);
    assert.equal(s.profit.fuelPaid, 0);
    assert.equal(s.fuelLogStatus.f, 'off_day');
    assert.equal(s.completeness.shiftsMissingFuel, 1);
  });

  it('yakıt tamamen bilinmiyor: km var, tüketim yok, dolum yok', () => {
    const s = day([plain('B', 'V1', { distanceKm: 100 })], []);
    assert.equal(s.profit.fuelPaid, 0);
    assert.equal(s.completeness.fuel, 'unknown');
    assert.equal(s.completeness.fuelSource, 'none');
    assert.equal(s.completeness.shiftsMissingFuel, 1);
  });

  it('açık vardiya eksik sayılmaz; ona bağlı dolum o anki yakıttır', () => {
    const open = { ...shift(), id: 'O', vehicleId: 'V1' };
    const s = day([open], [fill('f', 700, { shiftId: 'O' })]);
    assert.equal(s.profit.fuelPaid, k(700));
    assert.equal(s.completeness.closedShiftCount, 0);
    assert.equal(s.completeness.openShiftCount, 1);
    assert.equal(s.completeness.fuel, 'none');
    assert.equal(s.completeness.distance, 'none');
    assert.equal(s.shiftsMissingDistance, 0);
  });

  it('tüketim varken dolum: cebe kalan tüketimle, satırlar yine gerçek kâra ulaşır', () => {
    // Ciro 1000, dolum 700, tüketim 500 → cebe kalan 500; dolum not olarak söylenir.
    const s = calculateDaySummary({
      rides: [ride(1000, 0)], expenses: [],
      fuelLogs: [fill('f', 700, { shiftId: 'A' })],
      shifts: [{ ...burning('A'), wearPerKmKurus: k(2.5) }],
      now: T0 + 10 * H,
    });
    assert.equal(s.completeness.fillsNotCountedKurus, 70000);
    assert.equal(s.profit.cashProfit, 50000);
    assert.equal(s.profit.trueProfit, s.profit.cashProfit - s.profit.wearShare);
    assert.equal(
      s.profit.revenue - s.profit.commission - s.profit.fuelPaid - s.profit.expensesPaid
        - s.profit.wearShare,
      s.profit.trueProfit,
    );
  });

  it('eski satırlar (araç ve bağ bilgisi yok) eski davranışla hesaplanır', () => {
    const s = calculateDaySummary({
      rides: [ride(1000, 0)], expenses: [],
      fuelLogs: [{ totalAmountKurus: k(300) }],
      shifts: [shift({ endedAt: T0 + 5 * H })],
      now: T0 + 6 * H,
    });
    assert.equal(s.profit.fuelPaid, k(300));
  });

  it('bütün yakıt tutarları tam sayı kuruş', () => {
    const s = day([burning('A'), plain('B')], [fill('f', 333.33), fill('g', 1.01, { shiftId: 'B' })]);
    for (const v of [s.profit.fuelPaid, s.completeness.fillsNotCountedKurus,
      s.completeness.offDayFillsKurus]) {
      assert.ok(Number.isInteger(v), String(v));
    }
  });
});

describe('eksiklik tutardan bağımsız', () => {
  it('gerçek sıfır komisyon eksik DEĞİL; boş bırakılan eksik', () => {
    const s = calculateDaySummary({
      rides: [ride(1000, 0)], expenses: [], fuelLogs: [],
      shifts: [
        { ...shift({ endedAt: T0 + H }), commissionKurus: k(0) },
        { ...shift({ startedAt: T0 + 2 * H, endedAt: T0 + 3 * H }), commissionKurus: null },
      ],
      now: T0 + 4 * H,
    });
    assert.equal(s.completeness.shiftsMissingCommission, 1);
    assert.equal(s.completeness.commission, 'partial');
    assert.equal(s.profit.commission, 0);
  });

  it('yalnızca gider içeren gün km eksik sayılmaz', () => {
    const s = calculateDaySummary({
      rides: [], expenses: [{ amountKurus: k(500) }], fuelLogs: [], shifts: [], now: T0,
    });
    assert.equal(s.completeness.distance, 'none');
    assert.equal(s.shiftsMissingDistance, 0);
    assert.equal(s.completeness.fuel, 'none');
  });
});

describe('günde gösterilecek bir şey var mı', () => {
  const base = { rides: [], expenses: [], fuelLogs: [], shifts: [], now: T0 + 10 * H };

  it('yalnızca gider', () => {
    const s = calculateDaySummary({ ...base, expenses: [{ amountKurus: k(500) }] });
    assert.equal(s.hasActivity, true);
    assert.equal(s.profit.cashProfit, k(-500));
    assert.equal(s.isWorkedDay, false);
  });

  it('yalnızca dolum', () => {
    assert.equal(calculateDaySummary({ ...base, fuelLogs: [{ totalAmountKurus: k(700) }] }).hasActivity, true);
  });

  it('yalnızca komisyonlu kapanmış vardiya', () => {
    const s = calculateDaySummary({
      ...base, shifts: [{ ...shift({ endedAt: T0 + H }), commissionKurus: k(100) }],
    });
    assert.equal(s.hasActivity, true);
    assert.equal(s.isWorkedDay, true);
  });

  it('tam sıfır dengelenmiş gün de gösterilir', () => {
    const s = calculateDaySummary({
      ...base, rides: [ride(500, 0)], expenses: [{ amountKurus: k(500) }],
    });
    assert.equal(s.profit.cashProfit, 0);
    assert.equal(s.hasActivity, true);
  });

  it('yalnızca açık vardiya ya da boş gün — gösterilecek bir şey yok', () => {
    assert.equal(calculateDaySummary({ ...base, shifts: [shift()] }).hasActivity, false);
    assert.equal(calculateDaySummary(base).hasActivity, false);
  });
});
