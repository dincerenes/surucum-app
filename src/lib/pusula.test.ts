import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PUSULA_CITIES, type HourlyProfileKey, type Zone, type ZoneWindow } from './pusula-data.ts';
import {
  type DemandModel, type NowState, type ZoneView,
  LEVEL_LABELS, SOURCE_LABELS,
  activeOccurrence, activeZonesSentence, addLocalDays, bestDays, dayOptions, demandAt,
  driverDayStart, formatDays, formatWindow, formatZoneWindows, getDemandModel, hotDaysSentence,
  homeHint, hotHoursSentence, needleRatio, waveLine, hotWindows, hourStrip, isInSeason, isPusulaCity, levelFor, listTr,
  nowSentence, nowState, orderedCities, profileFor, pusulaSnapshot, quietestDay,
  resolvePusulaCity, weekRanks, weekdayOf, zonesAt,
} from './pusula.ts';

// Eylül 2026: 21 Pzt, 22 Sal, 23 Çar, 24 Per, 25 Cum, 26 Cmt, 27 Paz, 28 Pzt.
// Tarihler hep yerel kurucuyla: CI TZ=UTC koşuyor, mantık yerel saat okuyor.
const at = (month0: number, day: number, hour = 0, minute = 0) => new Date(2026, month0, day, hour, minute);
const sep = (day: number, hour = 0, minute = 0) => at(8, day, hour, minute);

const range = <T,>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));
const ONES = range(12, () => 1);

function model(
  hourly: Readonly<Record<HourlyProfileKey, readonly number[]>>,
  o: { monthFactor?: number[]; dayOfWeek?: number[]; zones?: Zone[] } = {},
): DemandModel {
  return {
    city: 'İstanbul',
    source: 'tahmin',
    updated: 'test',
    hourly,
    dayOfWeek: o.dayOfWeek ?? [50, 90, 60, 90, 80, 100, 40],
    monthFactor: o.monthFactor ?? ONES,
    zones: o.zones ?? [],
  };
}

/**
 * Değeri profili ve saati ele veren model: weekday = saat, friday = 25 +
 * saat, saturday = 50 + saat, sunday = 75 + saat. Ocak ×0,5, Temmuz ×1,3.
 */
const CODED = model(
  {
    weekday: range(24, (h) => h),
    friday: range(24, (h) => 25 + h),
    saturday: range(24, (h) => 50 + h),
    sunday: range(24, (h) => 75 + h),
  },
  { monthFactor: ONES.map((f, i) => (i === 0 ? 0.5 : i === 6 ? 1.3 : f)) },
);

/**
 * Pencereleri belli model: hafta içi 08–10 ve 17–20; Cuma ayrıca 23:00'te,
 * Cumartesi takvim gününün 00–03'ü (= Cuma gecesi). Cumartesi ve Pazar
 * sürücü günleri sakin (en yüksek 20).
 */
function busy(hours: number[], base = 20): number[] {
  return range(24, (h) => (hours.includes(h) ? 90 : base));
}
const WINDOWS = model({
  weekday: busy([8, 9, 17, 18, 19]),
  friday: busy([8, 9, 17, 18, 19, 23]),
  saturday: busy([0, 1, 2]),
  sunday: busy([]),
});

const win = (days: number[], fromHour: number, toHour: number, intensity: 1 | 2 | 3 = 1): ZoneWindow =>
  ({ days, fromHour, toHour, intensity }) as ZoneWindow;

const zone = (id: string, windows: ZoneWindow[], season: Zone['season'] = 'all'): Zone => ({
  id, name: id, district: 'Test', kind: 'diger', windows, season, reason: 'test',
});

const hours = (d: Date | null) => (d ? [d.getDate(), d.getHours()] : null);

describe('şehir', () => {
  it('desteklenen şehir birebir eşleşir, boşluk kırpılır', () => {
    assert.deepEqual(resolvePusulaCity('İzmir'), { kind: 'supported', city: 'İzmir' });
    assert.deepEqual(resolvePusulaCity('  İzmir '), { kind: 'supported', city: 'İzmir' });
    assert.ok(isPusulaCity('Antalya'));
    assert.ok(!isPusulaCity('izmir'), 'küçük harf ayrı yazım');
  });

  it('desteklenmeyen şehir kendi adıyla döner, İstanbul yedek', () => {
    assert.deepEqual(resolvePusulaCity('Bursa'), { kind: 'unsupported', ownCity: 'Bursa', fallback: 'İstanbul' });
  });

  it('boş şehir eksik sayılır', () => {
    for (const c of [null, undefined, '', '   ']) {
      assert.deepEqual(resolvePusulaCity(c), { kind: 'missing', fallback: 'İstanbul' });
    }
  });

  it('kendi şehri başa gelir, gerisi veri sırasıyla', () => {
    assert.deepEqual(orderedCities(resolvePusulaCity('İzmir')), ['İzmir', 'İstanbul', 'Ankara', 'Antalya']);
    assert.deepEqual(orderedCities(resolvePusulaCity('Bursa')), [...PUSULA_CITIES]);
    assert.deepEqual(orderedCities(resolvePusulaCity(null)), [...PUSULA_CITIES]);
  });

  it('gerçek model tahmin olarak etiketli', () => {
    const m = getDemandModel('Ankara');
    assert.equal(m.city, 'Ankara');
    assert.equal(m.source, 'tahmin');
    assert.equal(SOURCE_LABELS[m.source], 'Tahmini');
    assert.equal(m.hourly.weekday.length, 24);
  });
});

describe('gün ve saat', () => {
  it('profil: Pzt–Per hafta içi, Cuma, Cumartesi, Pazar ayrı', () => {
    assert.deepEqual(
      range(7, profileFor),
      ['weekday', 'weekday', 'weekday', 'weekday', 'friday', 'saturday', 'sunday'],
    );
  });

  it('gün indeksi Pazartesi 0, Pazar 6', () => {
    assert.equal(weekdayOf(sep(21, 12)), 0);
    assert.equal(weekdayOf(sep(25, 12)), 4);
    assert.equal(weekdayOf(sep(27, 12)), 6);
  });

  it('talep takvim gününün profilinden', () => {
    assert.equal(demandAt(CODED, sep(23, 10)), 10);
    assert.equal(demandAt(CODED, sep(25, 18)), 43);
    // Cuma gecesi 01:00 takvimde Cumartesi.
    assert.equal(demandAt(CODED, sep(26, 1)), 51);
    assert.equal(demandAt(CODED, sep(27, 23)), 98);
  });

  it('ay çarpanı uygulanır, 0–100 arasına kırpılır', () => {
    assert.equal(demandAt(CODED, at(0, 5, 20)), 10, 'Ocak Pazartesi 20:00 → 20 × 0,5');
    assert.equal(demandAt(CODED, at(0, 5, 21)), 11, '10,5 yuvarlanır');
    assert.equal(demandAt(CODED, at(6, 5, 23)), 100, 'Temmuz Pazar 23:00 → 98 × 1,3 kırpılır');
  });

  it('sürücü günü 06:00 başlar', () => {
    assert.deepEqual(driverDayStart(sep(26, 1, 30)), sep(25, 6));
    assert.deepEqual(driverDayStart(sep(25, 6)), sep(25, 6));
    assert.deepEqual(driverDayStart(sep(25, 5, 59)), sep(24, 6));
    assert.deepEqual(driverDayStart(sep(25, 23, 59)), sep(25, 6));
    assert.deepEqual(driverDayStart(at(9, 1, 3)), sep(30, 6), 'ay sınırını geri geçer');
  });

  it('yerel gün ekleme saati korur', () => {
    assert.deepEqual(addLocalDays(sep(30, 6), 1), at(9, 1, 6));
    assert.deepEqual(addLocalDays(sep(25, 6, 15), -4), sep(21, 6, 15));
  });
});

describe('saat şeridi', () => {
  it('06..23 bugünden, 00..05 ertesi günden', () => {
    const cells = hourStrip(CODED, sep(23, 6));
    assert.equal(cells.length, 24);
    assert.deepEqual(cells.map((c) => c.hour), [...range(18, (i) => 6 + i), 0, 1, 2, 3, 4, 5]);
    assert.deepEqual(cells[0], { hour: 6, value: 6, ratio: 0.06 });
    assert.equal(cells[17].value, 23);
    // Çarşamba gecesi takvimde Perşembe: hâlâ weekday.
    assert.equal(cells[18].value, 0);
  });

  it('Cuma şeridinin gecesi Cumartesi profilinden', () => {
    const cells = hourStrip(CODED, sep(25, 6));
    assert.equal(cells[17].value, 48);
    assert.deepEqual(cells.slice(18).map((c) => c.value), [50, 51, 52, 53, 54, 55]);
  });

  it('Pazar şeridinin gecesi Pazartesi, yani hafta içi profilinden', () => {
    const cells = hourStrip(CODED, sep(27, 6));
    assert.equal(cells[0].value, 81);
    assert.equal(cells[17].value, 98);
    assert.deepEqual(cells.slice(18).map((c) => c.value), [0, 1, 2, 3, 4, 5]);
  });
});

describe('yoğun pencereler', () => {
  const zeros = () => range(24, () => 0);
  const withHot = (idx: number[], v = 100) => {
    const a = zeros();
    for (const i of idx) a[i] = v;
    return a;
  };

  it('tek koşu', () => {
    assert.deepEqual(hotWindows(withHot([11, 12, 13])), [
      { startIdx: 11, endIdx: 14, fromHour: 17, toHour: 20, peak: 100 },
    ]);
  });

  it('iki koşu zamana göre', () => {
    const ws = hotWindows(withHot([2, 3, 11, 12]));
    assert.deepEqual(ws.map(formatWindow), ['08:00–10:00', '17:00–19:00']);
  });

  it('bir saatlik boşluk birleşir, iki saatlik birleşmez', () => {
    assert.deepEqual(hotWindows(withHot([10, 12])), [
      { startIdx: 10, endIdx: 13, fromHour: 16, toHour: 19, peak: 100 },
    ]);
    assert.equal(hotWindows(withHot([10, 13])).length, 2);
  });

  it('şeridin sonuna uzanan pencere 06:00 biter', () => {
    const [w] = hotWindows(withHot([22, 23]));
    assert.equal(w.endIdx, 24);
    assert.equal(w.fromHour, 4);
    assert.equal(w.toHour, 6);
  });

  it('gece yarısını geçen pencere', () => {
    assert.deepEqual(hotWindows(withHot([17, 18, 19, 20])).map(formatWindow), ['23:00–03:00']);
  });

  it('zirve 40 altındaysa pencere yok; 40 tabanı tutar', () => {
    assert.deepEqual(hotWindows(range(24, () => 39)), []);
    assert.deepEqual(hotWindows([]), []);
    assert.equal(hotWindows(withHot([5], 40)).length, 1);
  });

  it('eşik zirveye göre: zirvenin çok altındaki saat girmez', () => {
    const a = withHot([12]);
    a[11] = 50;
    assert.deepEqual(hotWindows(a).map((w) => [w.startIdx, w.endIdx]), [[12, 13]]);
  });

  it('üçten fazla koşu: en yüksek zirveli üçü, zaman sırasıyla', () => {
    const a = zeros();
    a[0] = 95; a[4] = 100; a[8] = 92; a[12] = 99; a[16] = 98;
    assert.deepEqual(hotWindows(a).map((w) => w.startIdx), [4, 12, 16]);
  });

  it('zirve eşitliğinde erken olan kalır', () => {
    assert.deepEqual(hotWindows(withHot([0, 4, 8, 12])).map((w) => w.startIdx), [0, 4, 8]);
  });

  it('alçak sabah zirvesi de kendi penceresini açar', () => {
    // 06..: sabah 08'de 70, akşam 18'de 90 — tek eşik sabahı yutuyordu.
    const a = range(24, () => 20);
    a[1] = 55; a[2] = 70; a[3] = 58; a[11] = 82; a[12] = 90; a[13] = 84;
    assert.deepEqual(hotWindows(a).map(formatWindow), ['08:00–10:00', '17:00–20:00']);
  });

  it('düz hafta sonu eğrisi uzun tek pencereye dönmez', () => {
    const a = range<number>(24, (i) => (i >= 6 ? 70 : 30));
    a[13] = 84; a[18] = 90;
    for (const w of hotWindows(a)) assert.ok(w.endIdx - w.startIdx <= 8, formatWindow(w));
  });

  it('başlangıç saati verilebilir', () => {
    assert.deepEqual(hotWindows(withHot([17, 18]), 0).map(formatWindow), ['17:00–19:00']);
  });
});

describe('biçim', () => {
  it('saat aralığı', () => {
    assert.equal(formatWindow({ fromHour: 17, toHour: 20 }), '17:00–20:00');
    assert.equal(formatWindow({ fromHour: 23, toHour: 3 }), '23:00–03:00');
    assert.equal(formatWindow({ fromHour: 18, toHour: 0 }), '18:00–00:00');
    assert.equal(formatWindow({ fromHour: 18, toHour: 24 }), '18:00–00:00');
  });

  it('Türkçe liste', () => {
    assert.equal(listTr([]), '');
    assert.equal(listTr(['a']), 'a');
    assert.equal(listTr(['a', 'b']), 'a ve b');
    assert.equal(listTr(['a', 'b', 'c']), 'a, b ve c');
  });

  it('yoğunluk seviyesi sınırları', () => {
    assert.deepEqual([0, 29, 30, 54, 55, 79, 80, 100].map(levelFor), [0, 0, 1, 1, 2, 2, 3, 3]);
    assert.equal(LEVEL_LABELS[levelFor(85)], 'Çok yoğun');
  });

  it('gün listesi', () => {
    assert.equal(formatDays([1, 2, 3, 4, 5, 6, 7]), 'Her gün');
    assert.equal(formatDays([1, 2, 3, 4, 5]), 'Hafta içi');
    assert.equal(formatDays([6, 7]), 'Hafta sonu');
    assert.equal(formatDays([1, 2, 3, 4]), 'Pzt–Per');
    assert.equal(formatDays([5, 6]), 'Cum, Cmt');
    assert.equal(formatDays([6, 5]), 'Cum, Cmt');
    assert.equal(formatDays([7]), 'Paz');
    assert.equal(formatDays([1, 2, 3, 4, 7]), 'Pzt–Per, Paz');
    assert.equal(formatDays([5, 6, 7]), 'Cum–Paz');
  });

  it('bölge pencereleri: en fazla iki, fazlası sayı', () => {
    const a = win([1, 2, 3, 4, 5], 7, 10);
    const b = win([5, 6], 22, 3);
    const c = win([7], 15, 24);
    assert.equal(formatZoneWindows([a]), 'Hafta içi 07:00–10:00');
    assert.equal(formatZoneWindows([a, b]), 'Hafta içi 07:00–10:00 · Cum, Cmt 22:00–03:00');
    assert.equal(formatZoneWindows([a, b, c]), 'Hafta içi 07:00–10:00 · Cum, Cmt 22:00–03:00 · +1');
    assert.equal(formatZoneWindows([]), '');
  });
});

describe('şu an', () => {
  it('pencerenin içinde; sıradaki ertesi günün ilki', () => {
    const s = nowState(WINDOWS, sep(23, 18));
    assert.equal(s.value, 90);
    assert.equal(s.level, 3);
    assert.equal(s.current && formatWindow(s.current), '17:00–20:00');
    assert.equal(s.next?.tomorrow, true);
    assert.equal(s.next && formatWindow(s.next.window), '08:00–10:00');
  });

  it('ilk pencereden önce', () => {
    const s = nowState(WINDOWS, sep(23, 7, 30));
    assert.equal(s.current, null);
    assert.equal(s.next?.tomorrow, false);
    assert.equal(s.next && formatWindow(s.next.window), '08:00–10:00');
    assert.equal(nowState(WINDOWS, sep(23, 12)).next?.window.fromHour, 17);
  });

  it('son pencereden sonra yarının ilki', () => {
    const s = nowState(WINDOWS, sep(23, 21));
    assert.equal(s.current, null);
    assert.equal(s.value, 20);
    assert.equal(s.level, 0);
    assert.deepEqual(s.next && [s.next.tomorrow, formatWindow(s.next.window)], [true, '08:00–10:00']);
  });

  it('Cumartesi 01:00 Cuma gecesinin 23–03 penceresinde', () => {
    const s = nowState(WINDOWS, sep(26, 1));
    assert.equal(s.current && formatWindow(s.current), '23:00–03:00');
    assert.equal(s.current?.startIdx, 17);
  });

  it('hiç pencere yoksa sıradaki de yok', () => {
    const s = nowState(WINDOWS, sep(26, 10));
    assert.equal(s.current, null);
    assert.equal(s.next, null);
  });
});

describe('hafta', () => {
  it('sıralama oranı en yoğun güne göre', () => {
    const r = weekRanks(WINDOWS);
    assert.equal(r.length, 7);
    assert.deepEqual(r[5], { index: 5, value: 100, ratio: 1 });
    assert.deepEqual(r[0], { index: 0, value: 50, ratio: 0.5 });
  });

  it('en iyi günler: eşitlikte küçük indeks, gün sırasıyla', () => {
    assert.deepEqual(bestDays(WINDOWS), [1, 5]);
    assert.deepEqual(bestDays(WINDOWS, 3), [1, 3, 5]);
    assert.deepEqual(bestDays(WINDOWS, 1), [5]);
  });

  it('en sakin gün; eşitlikte küçük indeks', () => {
    assert.equal(quietestDay(WINDOWS), 6);
    const flat = model(WINDOWS.hourly, { dayOfWeek: [70, 40, 80, 40, 90, 100, 60] });
    assert.equal(quietestDay(flat), 1);
  });
});

describe('bölge penceresi', () => {
  it('gece yarısını geçen pencere başladığı güne ait', () => {
    const w = win([5], 22, 3);
    const fri = activeOccurrence(w, sep(25, 23));
    assert.deepEqual(fri, { start: sep(25, 22), end: sep(26, 3) });
    assert.deepEqual(activeOccurrence(w, sep(26, 1)), { start: sep(25, 22), end: sep(26, 3) });
    assert.equal(activeOccurrence(w, sep(26, 3)), null);
    assert.equal(activeOccurrence(w, sep(25, 21, 59)), null);
    assert.equal(activeOccurrence(w, sep(26, 23)), null, 'Cumartesi listede yok');
  });

  it('Pazar gecesi penceresi Pazartesi sabahına uzanır', () => {
    assert.notEqual(activeOccurrence(win([7], 22, 2), sep(28, 1)), null);
  });

  it('Pazartesi gecesi penceresi Pazartesi 01:00 değil, Salı 01:00 açık', () => {
    const w = win([1], 22, 2);
    assert.equal(activeOccurrence(w, sep(28, 1)), null);
    assert.notEqual(activeOccurrence(w, sep(29, 1)), null);
  });

  it('24 ile biten pencere gece yarısı kapanır', () => {
    const w = win([3], 18, 24);
    assert.deepEqual(activeOccurrence(w, sep(23, 23, 30)), { start: sep(23, 18), end: sep(24, 0) });
    assert.equal(activeOccurrence(w, sep(24, 0, 30)), null);
  });

  it('sezon', () => {
    assert.ok(isInSeason('all', 1));
    assert.ok(isInSeason('summer', 8));
    assert.ok(!isInSeason('summer', 0));
    assert.ok(isInSeason('winter', 11));
    assert.ok(!isInSeason('school-term', 1), 'Şubat yarıyıl tatili');
    assert.ok(!isInSeason('school-term', 6));
    assert.ok(isInSeason('school-term', 8));
  });

  it('yaz bölgesi Ocak ayında gizli, Temmuz ayında görünür', () => {
    const m = model(WINDOWS.hourly, {
      zones: [zone('her-zaman', [win([3], 18, 22)]), zone('yaz', [win([3], 18, 22)], 'summer')],
    });
    assert.deepEqual(zonesAt(m, new Date(2027, 0, 6, 19)).map((v) => v.zone.id), ['her-zaman']);
    assert.deepEqual(zonesAt(m, at(6, 8, 19)).map((v) => v.zone.id), ['her-zaman', 'yaz']);
  });
});

describe('bölge sırası', () => {
  const ZONED = model(WINDOWS.hourly, {
    zones: [
      zone('aktif-dusuk', [win([3], 17, 20, 1)]),
      zone('diger-1a', [win([3, 4], 8, 10, 1)]),
      zone('sonra-gec', [win([3], 22, 2, 3)]),
      zone('aktif-yuksek', [win([3], 18, 19, 3)]),
      zone('diger-3', [win([1], 8, 10, 3)]),
      zone('gece', [win([4], 2, 5, 2)]),
      zone('kis', [win([3], 17, 20, 3)], 'winter'),
      zone('sonra-erken', [win([3], 20, 21, 1)]),
      zone('diger-1b', [win([2], 8, 10, 1)]),
      zone('coklu', [win([3], 17, 20, 1), win([3], 18, 20, 2)]),
    ],
  });
  const now = sep(23, 18);
  const views = zonesAt(ZONED, now);
  const byId = (id: string) => views.find((v) => v.zone.id === id) as ZoneView;

  it('açık → açılacak → diğer; eşitlikte veri sırası', () => {
    assert.deepEqual(views.map((v) => v.zone.id), [
      'aktif-yuksek', 'coklu', 'aktif-dusuk',
      'sonra-erken', 'sonra-gec', 'gece',
      'diger-3', 'diger-1a', 'diger-1b',
    ]);
  });

  it('açık bölgede en yoğun açık pencere', () => {
    const v = byId('coklu');
    assert.equal(v.status, 'active');
    assert.equal(v.intensity, 2);
    assert.equal(v.window?.fromHour, 18);
    assert.deepEqual([hours(v.start), hours(v.end)], [[23, 18], [23, 20]]);
  });

  it('açılacak bölge başlangıç ve bitişiyle; gece yarısını geçen ertesi gün biter', () => {
    const v = byId('sonra-gec');
    assert.equal(v.status, 'later');
    assert.deepEqual([hours(v.start), hours(v.end)], [[23, 22], [24, 2]]);
    assert.deepEqual(hours(byId('gece').start), [24, 2]);
  });

  it('sonraki 06:00 sonrası açılan bölge "diğer", penceresiz', () => {
    const v = byId('diger-1a');
    assert.equal(v.status, 'other');
    assert.equal(v.window, null);
    assert.equal(v.start, null);
    assert.equal(byId('diger-3').intensity, 3);
  });
});

describe('gün seçici ve özet', () => {
  it('Çarşamba 14:00: Bugün, Yarın, sonra kısa adlar', () => {
    const opts = dayOptions(sep(23, 14));
    assert.deepEqual(opts.map((o) => o.label), ['Bugün', 'Yarın', 'Cum', 'Cmt', 'Paz', 'Pzt', 'Sal']);
    assert.deepEqual(opts.map((o) => o.offset), [0, 1, 2, 3, 4, 5, 6]);
    assert.equal(opts[2].fullName, 'Cuma');
    assert.deepEqual(opts[2].start, sep(25, 6));
  });

  it('Perşembe 02:00: "Bugün" Çarşamba 06:00 başlar', () => {
    const [today, tomorrow] = dayOptions(sep(24, 2));
    assert.deepEqual(today.start, sep(23, 6));
    assert.equal(today.fullName, 'Çarşamba');
    assert.equal(tomorrow.fullName, 'Perşembe');
  });

  it('bugünün şeridi, pencereleri ve şimdiki saat', () => {
    const s = pusulaSnapshot(WINDOWS, sep(23, 18, 30), 0);
    assert.equal(s.source, 'tahmin');
    assert.equal(s.day.option.label, 'Bugün');
    assert.equal(s.day.cells.length, 24);
    assert.equal(s.day.nowIndex, 12);
    assert.deepEqual(s.day.windows.map(formatWindow), ['08:00–10:00', '17:00–20:00']);
    assert.equal(s.now.current && formatWindow(s.now.current), '17:00–20:00');
    assert.deepEqual(s.week.best, [1, 5]);
    assert.equal(s.week.quietest, 6);
    assert.equal(s.week.todayIndex, 2);
  });

  it('başka gün seçilince şimdiki saat yok; aralık dışı en yakın uca', () => {
    const fri = pusulaSnapshot(WINDOWS, sep(23, 18), 2);
    assert.equal(fri.day.nowIndex, null);
    assert.deepEqual(fri.day.windows.map(formatWindow), ['08:00–10:00', '17:00–20:00', '23:00–03:00']);
    assert.equal(pusulaSnapshot(WINDOWS, sep(23, 18), 99).day.option.offset, 6);
    assert.equal(pusulaSnapshot(WINDOWS, sep(23, 18), -1).day.option.offset, 0);
  });

  it('gece yarısından sonra bugün hâlâ dünün sürücü günü', () => {
    const s = pusulaSnapshot(WINDOWS, sep(24, 2), 0);
    assert.equal(s.week.todayIndex, 2);
    assert.equal(s.day.nowIndex, 20);
  });
});

describe('cümleler', () => {
  const w = (fromHour: number, toHour: number) => ({ startIdx: 0, endIdx: 1, fromHour, toHour, peak: 90 });
  const state = (o: Partial<NowState>): NowState => ({ value: 50, level: 1, current: null, next: null, ...o });

  it('şu an', () => {
    assert.equal(nowSentence(state({ current: w(23, 3) })), 'Yoğun saatlerin içindesin: 23:00–03:00.');
    assert.equal(
      nowSentence(state({ next: { window: w(17, 20), tomorrow: false, weekday: 2 } })),
      'Sıradaki yoğun saatler: 17:00–20:00.',
    );
    assert.equal(
      nowSentence(state({ next: { window: w(8, 10), tomorrow: true, weekday: 5 } })),
      'Bugünün yoğun saatleri geçti. Sıradaki: Cumartesi 08:00–10:00.',
    );
    assert.equal(nowSentence(state({})), 'Önümüzdeki saatlerde belirgin bir yoğunluk beklenmiyor.');
  });

  it('yoğun saatler', () => {
    assert.equal(hotHoursSentence([w(8, 10), w(23, 3)]), 'En yoğun saatler: 08:00–10:00 ve 23:00–03:00.');
    assert.equal(hotHoursSentence([w(17, 20)]), 'En yoğun saatler: 17:00–20:00.');
    assert.equal(hotHoursSentence([]), 'Bu gün için belirgin bir yoğun saat beklenmiyor.');
  });

  it('yoğun günler', () => {
    assert.equal(hotDaysSentence([4, 5], 0), 'En hareketli günler Cuma ve Cumartesi; en sakin gün Pazartesi.');
    assert.equal(hotDaysSentence([5], 6), 'En hareketli gün Cumartesi; en sakin gün Pazar.');
  });

  it('hareketli bölgeler: ilk üç açık bölge', () => {
    const v = (id: string, status: ZoneView['status']): ZoneView => ({
      zone: zone(id, []), status, intensity: 1, window: null, start: null, end: null,
    });
    assert.equal(
      activeZonesSentence([v('A', 'active'), v('B', 'active'), v('C', 'active'), v('D', 'active')]),
      'Hareketli bölgeler: A, B ve C.',
    );
    assert.equal(activeZonesSentence([v('A', 'active'), v('B', 'later')]), 'Hareketli bölgeler: A.');
    assert.equal(activeZonesSentence([v('B', 'later')]), 'Şu an öne çıkan bir bölge yok.');
  });
});

describe('anasayfa ipucu', () => {
  const ZONED = model(WINDOWS.hourly, {
    zones: [
      zone('Düşük', [win([3], 17, 20, 1)]),
      zone('Yüksek', [win([3], 18, 19, 3)]),
      zone('Orta', [win([3], 17, 20, 2)]),
    ],
  });

  it('açık bölge varsa en yoğun ikisinin adı', () => {
    assert.deepEqual(homeHint(ZONED, sep(23, 18)), {
      level: 3, label: 'Çok yoğun', detail: 'Yüksek ve Orta',
    });
  });

  it('açık bölge yoksa saat: içinde bulunulan, sonra bugünün sıradaki penceresi', () => {
    assert.equal(homeHint(WINDOWS, sep(23, 18)).detail, 'yoğun saatler 17:00–20:00');
    assert.equal(homeHint(WINDOWS, sep(23, 12)).detail, 'sıradaki yoğun saatler 17:00–20:00');
  });

  it('bugün pencere kalmadıysa ertesi günü söylemiyor', () => {
    const h = homeHint(WINDOWS, sep(23, 21));
    assert.deepEqual([h.label, h.detail], ['Sakin', 'bugün belirgin yoğunluk kalmadı']);
  });
});

describe('kadran', () => {
  it('ibre yazan seviyenin diliminde kalıyor', () => {
    for (let v = 0; v <= 100; v++) {
      const r = needleRatio(v);
      const slice = Math.min(3, Math.floor(r * 4));
      assert.equal(slice, levelFor(v), `talep ${v}`);
    }
  });

  it('uçlar ve geçersiz değer', () => {
    assert.equal(needleRatio(0), 0);
    assert.equal(needleRatio(100), 1);
    assert.equal(needleRatio(140), 1);
    assert.equal(needleRatio(Number.NaN), 0);
    assert.equal(needleRatio(30), 0.25);
  });
});

describe('sıradaki dalga', () => {
  it('pencerenin içinde: bitiş saati', () => {
    const w = waveLine(nowState(WINDOWS, sep(23, 18)), sep(23, 18));
    assert.deepEqual(w, { active: true, title: 'Yoğun saatlerin içindesin', pill: 'bitiş 20:00' });
  });

  it('bugün sıradaki pencere: kalan süre', () => {
    const at = sep(23, 12, 53);
    const w = waveLine(nowState(WINDOWS, at), at);
    assert.deepEqual(w, { active: false, title: 'Sıradaki dalga 17:00–20:00', pill: '4 sa 7 dk sonra' });
    const early = sep(23, 7, 30);
    assert.equal(waveLine(nowState(WINDOWS, early), early).pill, '30 dk sonra');
  });

  it('ertesi günün penceresi: süre değil gün adı', () => {
    const at = sep(23, 21);
    const w = waveLine(nowState(WINDOWS, at), at);
    assert.deepEqual(w, { active: false, title: 'Sıradaki dalga Perşembe 08:00–10:00', pill: null });
  });

  it('hiç pencere yok', () => {
    const at = sep(26, 10);
    assert.equal(waveLine(nowState(WINDOWS, at), at).title, 'Önümüzdeki saatlerde belirgin yoğunluk yok');
  });
});
