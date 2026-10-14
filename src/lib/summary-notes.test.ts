import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateDaySummary } from './day-summary.ts';
import { calculatePeriodTotals } from './stats.ts';
import { asBusinessDate } from './business-date.ts';
import type { Kurus } from './money.ts';
import {
  CASH_PROFIT_CAPTION, buildDayNotes, buildPeriodNotes, fuelLogNote, fuelRowLabel, isFuelUnknown,
} from './summary-notes.ts';

const k = (n: number) => n as Kurus;
const ride = { grossAmountKurus: k(100_000), commissionKurus: k(0), tipKurus: k(0) };
const closed = (o: object = {}) => ({
  id: 'S', vehicleId: 'V', startedAt: 0, endedAt: 1, workedMinutes: null, distanceKm: 100,
  commissionKurus: k(0), ...o,
});
const burning = { fuelConsumptionPer100Km: 10_000, fuelPriceKurus: k(5_000) };

const texts = (notes: { text: string }[]) => notes.map((n) => n.text);

describe('gün açıklamaları', () => {
  it('her şey girilmişse hiçbir şey söylenmez', () => {
    const s = calculateDaySummary({
      rides: [ride], expenses: [], fuelLogs: [], shifts: [closed(burning)], now: 2,
    });
    assert.deepEqual(buildDayNotes(s), []);
  });

  it('yakıt bilinmiyorsa uyarı var — tutar sıfır olsa da', () => {
    const s = calculateDaySummary({
      rides: [ride], expenses: [], fuelLogs: [], shifts: [closed()], now: 2,
    });
    const notes = buildDayNotes(s);
    assert.equal(notes.length, 1);
    assert.equal(notes[0].tone, 'warning');
    assert.match(notes[0].text, /Yakıt bilinmiyor/);
  });

  it('km de yoksa tek birleşik uyarı', () => {
    const s = calculateDaySummary({
      rides: [ride], expenses: [], fuelLogs: [], shifts: [closed({ distanceKm: null })], now: 2,
    });
    const notes = buildDayNotes(s);
    assert.equal(notes.length, 1);
    assert.match(notes[0].text, /yıpranma payı ve yakıt hesaplanmadı/);
  });

  it('boş bırakılan komisyon söylenir, 0 yazılan söylenmez', () => {
    const bos = calculateDaySummary({
      rides: [ride], expenses: [], fuelLogs: [],
      shifts: [closed({ ...burning, commissionKurus: null })], now: 2,
    });
    assert.deepEqual(texts(buildDayNotes(bos)), ['Komisyon girilmemiş; sıfır sayıldı.']);
  });

  it('tüketim varken sayılmayan dolum TUTARIYLA bilgi olarak söylenir', () => {
    const s = calculateDaySummary({
      rides: [ride], expenses: [],
      fuelLogs: [{ id: 'f', shiftId: 'S', vehicleId: 'V', totalAmountKurus: k(70_000) }],
      shifts: [closed(burning)], now: 2,
    });
    const notes = buildDayNotes(s);
    assert.deepEqual(notes, [{
      tone: 'info', text: '700,00 ₺ dolum ayrıca düşülmedi; yakıt tüketimden hesaplandı.',
    }]);
  });

  it('dolumdan sayılan yakıt ve gün dışı depo alımı bilgi olarak söylenir', () => {
    const filled = calculateDaySummary({
      rides: [ride], expenses: [],
      fuelLogs: [{ id: 'f', shiftId: 'S', vehicleId: 'V', totalAmountKurus: k(30_000) }],
      shifts: [closed()], now: 2,
    });
    assert.deepEqual(buildDayNotes(filled).map((n) => n.tone), ['info']);
    assert.match(buildDayNotes(filled)[0].text, /dolum tutarından sayıldı/);

    const offDay = calculateDaySummary({
      rides: [], expenses: [], fuelLogs: [{ id: 'f', vehicleId: 'V', totalAmountKurus: k(100_000) }],
      shifts: [], now: 2,
    });
    assert.match(buildDayNotes(offDay)[0].text, /^1\.000,00 ₺ depo alımı hesaba ayrıca girmedi/);
  });

  it('açık vardiyada dolumdan sayılan yakıt "girilmemiş" denmeden söylenir', () => {
    const s = calculateDaySummary({
      rides: [ride], expenses: [],
      fuelLogs: [{ id: 'f', shiftId: 'S', vehicleId: 'V', totalAmountKurus: k(70_000) }],
      shifts: [closed({ endedAt: null, distanceKm: null })], now: 2,
    });
    const notes = buildDayNotes(s);
    assert.equal(notes.length, 1);
    assert.equal(notes[0].tone, 'info');
    assert.match(notes[0].text, /şimdilik dolum tutarından/);
  });

  it('açık vardiya hiçbir uyarı üretmez', () => {
    const s = calculateDaySummary({
      rides: [ride], expenses: [], fuelLogs: [],
      shifts: [closed({ endedAt: null, distanceKm: null, commissionKurus: null })], now: 2,
    });
    assert.deepEqual(buildDayNotes(s), []);
  });
});

describe('dönem açıklamaları', () => {
  it('eksik vardiyalar ve sayılmayan dolumlar toplanıp söylenir', () => {
    const day = (date: string, o: object, fuelLogs: object[] = []) => ({
      date: asBusinessDate(date),
      summary: calculateDaySummary({
        rides: [ride], expenses: [], fuelLogs: fuelLogs as never, shifts: [closed(o)] as never, now: 2,
      }),
    });
    const t = calculatePeriodTotals([
      day('2026-09-14', { distanceKm: null }),
      day('2026-09-15', {}),
      day('2026-09-16', burning, [{ shiftId: 'S', vehicleId: 'V', totalAmountKurus: k(10_000) }]),
    ]);
    assert.deepEqual(texts(buildPeriodNotes(t)), [
      '1 vardiyanın kilometresi girilmemiş; yıpranma payı o vardiyalar için hesaplanmadı ve gerçek kâr olduğundan iyi görünüyor.',
      '2 vardiyanın yakıtı bilinmiyor; cebe kalan olduğundan iyi görünüyor.',
      '100,00 ₺ dolum ayrıca düşülmedi; o günlerde yakıt tüketimden hesaplandı.',
    ]);
  });
});

describe('satır etiketleri', () => {
  it('cebe kalanın alt metni "yıpranma hariç" — nakit iddiası yok', () => {
    assert.equal(CASH_PROFIT_CAPTION, 'yıpranma hariç');
  });

  it('yakıt satırı kaynağını söyler', () => {
    assert.equal(fuelRowLabel('burned', 17_900), 'Yakıt · tüketimden 17,9 lt');
    assert.equal(fuelRowLabel('filled', null), 'Yakıt · dolumdan');
    assert.equal(fuelRowLabel('mixed', 15_000), 'Yakıt · tüketimden 15,0 lt + dolum');
    assert.equal(fuelRowLabel('none', null), 'Yakıt');
  });

  it('sıfır yakıt ile bilinmeyen yakıt ayrı', () => {
    assert.equal(isFuelUnknown(k(0), 1), true);
    assert.equal(isFuelUnknown(k(0), 0), false);
    assert.equal(isFuelUnknown(k(500), 1), false);
  });

  it('Kayıtlar\'da sayılmayan dolumun açıklaması', () => {
    assert.equal(fuelLogNote('covered'), 'tüketimden sayıldı · ayrıca düşülmedi');
    assert.equal(fuelLogNote('off_day'), 'depo alımı · hesaba ayrıca girmedi');
    assert.equal(fuelLogNote('counted'), null);
    assert.equal(fuelLogNote(undefined), null);
  });
});
