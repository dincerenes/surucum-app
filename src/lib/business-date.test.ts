import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  toBusinessDate, todayBusinessDate, businessDateBounds, nextBusinessDateChange,
  isBusinessDate, asBusinessDate,
  addDays, daysBetween, compareBusinessDate, businessDatesInRange,
  startOfMonth, endOfMonth, daysInMonth, startOfWeek, endOfWeek, startOfYear,
  weekdayIndex, weekdayName, formatBusinessDate, formatRelative, formatClock,
  DEFAULT_CUTOFF_HOUR, WEEKDAYS_SHORT_TR, WEEKDAYS_TR,
  type BusinessDate,
} from './business-date.ts';

const BD = (s: string) => asBusinessDate(s);

describe('doğrulama', () => {
  test('geçerli biçimi kabul eder', () => {
    assert.ok(isBusinessDate('2026-08-25'));
    assert.ok(isBusinessDate('2028-02-29')); // artık yıl
  });

  test('geçersizi reddeder', () => {
    assert.ok(!isBusinessDate('2026-02-30'));
    assert.ok(!isBusinessDate('2026-13-01'));
    assert.ok(!isBusinessDate('2027-02-29')); // artık yıl değil
    assert.ok(!isBusinessDate('26-08-25'));
    assert.ok(!isBusinessDate('2026-8-25'));
    assert.ok(!isBusinessDate(''));
    assert.ok(!isBusinessDate(20260825));
    assert.throws(() => asBusinessDate('2026-02-30'), TypeError);
  });
});

describe('gece vardiyası — asıl mesele bu', () => {
  test('kesme saatinden önce bir önceki iş günü', () => {
    // 25 Ağustos 02:30 → sürücü hâlâ dünün vardiyasında
    assert.equal(toBusinessDate(new Date(2026, 7, 25, 2, 30), 4), '2026-08-24');
  });

  test('kesme saatinde yeni gün başlar', () => {
    assert.equal(toBusinessDate(new Date(2026, 7, 25, 4, 0), 4), '2026-08-25');
    assert.equal(toBusinessDate(new Date(2026, 7, 25, 3, 59), 4), '2026-08-24');
  });

  test('gün içi ve gece yarısı öncesi aynı gün', () => {
    assert.equal(toBusinessDate(new Date(2026, 7, 25, 12, 0), 4), '2026-08-25');
    assert.equal(toBusinessDate(new Date(2026, 7, 25, 23, 59), 4), '2026-08-25');
  });

  test('22:00–06:00 vardiyasının tamamı tek iş gününe düşer', () => {
    const start = new Date(2026, 7, 24, 22, 0);
    const end = new Date(2026, 7, 25, 6, 0);
    assert.equal(toBusinessDate(start, 4), '2026-08-24');
    assert.equal(
      toBusinessDate(new Date(2026, 7, 25, 3, 0), 4),
      '2026-08-24',
      'vardiyanın ortası da aynı güne düşmeli',
    );
    assert.equal(
      toBusinessDate(end, 4),
      '2026-08-25',
      '06:00 kesme saatinden sonra, yeni güne düşer',
    );
  });

  test('ay sınırını geri geçer', () => {
    assert.equal(toBusinessDate(new Date(2026, 8, 1, 1, 0), 4), '2026-08-31');
  });

  test('yıl sınırını geri geçer', () => {
    assert.equal(toBusinessDate(new Date(2027, 0, 1, 2, 0), 4), '2026-12-31');
  });

  test('kesme saati 0 iken takvim günüyle aynı', () => {
    assert.equal(toBusinessDate(new Date(2026, 7, 25, 0, 30), 0), '2026-08-25');
    assert.equal(toBusinessDate(new Date(2026, 7, 25, 23, 30), 0), '2026-08-25');
  });

  test('kesme saati 6 olarak ayarlanabilir', () => {
    assert.equal(toBusinessDate(new Date(2026, 7, 25, 5, 0), 6), '2026-08-24');
    assert.equal(toBusinessDate(new Date(2026, 7, 25, 6, 0), 6), '2026-08-25');
  });

  test('varsayılan kesme saati gece yarısı — takvim günü', () => {
    assert.equal(DEFAULT_CUTOFF_HOUR, 0);
    assert.equal(toBusinessDate(new Date(2026, 7, 25, 3, 0)), '2026-08-25');
    assert.equal(toBusinessDate(new Date(2026, 7, 24, 23, 59)), '2026-08-24');
  });

  test('zaman damgası sayı olarak da verilebilir', () => {
    const ms = new Date(2026, 7, 25, 2, 30).getTime();
    assert.equal(toBusinessDate(ms, 4), '2026-08-24');
  });

  test('geçersiz tarih reddedilir', () => {
    assert.throws(() => toBusinessDate(new Date('geçersiz')), TypeError);
  });
});

describe('zaman aralığı', () => {
  test('bir iş günü tam 24 saattir (yaz saati olmayan bölgede)', () => {
    const { startMs, endMs } = businessDateBounds(BD('2026-08-25'), 4);
    assert.equal(endMs - startMs, 24 * 3600 * 1000);
  });

  test('aralık kesme saatinde başlar', () => {
    const { startMs } = businessDateBounds(BD('2026-08-25'), 4);
    const d = new Date(startMs);
    assert.equal(d.getHours(), 4);
    assert.equal(d.getDate(), 25);
  });

  test('aralık, o güne ait zaman damgalarını kapsar', () => {
    const { startMs, endMs } = businessDateBounds(BD('2026-08-24'), 4);
    const gece = new Date(2026, 7, 25, 2, 30).getTime();
    assert.ok(gece >= startMs && gece < endMs, 'gece 02:30 önceki iş gününe dahil');
  });
});

describe('bir sonraki gün dönümü', () => {
  test('kesme saatinden önce: aynı takvim gününün kesme saati', () => {
    const at = new Date(2026, 7, 25, 2, 30);
    assert.equal(nextBusinessDateChange(at, 4), new Date(2026, 7, 25, 4, 0).getTime());
  });

  test('kesme saatinden sonra: ertesi günün kesme saati', () => {
    const at = new Date(2026, 7, 25, 5, 0);
    assert.equal(nextBusinessDateChange(at, 4), new Date(2026, 7, 26, 4, 0).getTime());
  });

  test('tam kesme anında yeni gün başlamıştır; sonraki dönüm 24 saat sonra', () => {
    const at = new Date(2026, 7, 25, 4, 0);
    assert.equal(nextBusinessDateChange(at, 4), new Date(2026, 7, 26, 4, 0).getTime());
  });

  test('gece yarısı kesmesinde ay ve yıl dönümü', () => {
    assert.equal(
      nextBusinessDateChange(new Date(2026, 9, 31, 23, 59), 0),
      new Date(2026, 10, 1, 0, 0).getTime(),
    );
    assert.equal(
      nextBusinessDateChange(new Date(2026, 11, 31, 12, 0)),
      new Date(2027, 0, 1, 0, 0).getTime(),
    );
  });

  test('dönüm anında iş günü gerçekten değişir', () => {
    const at = new Date(2026, 9, 31, 22, 15);
    const next = nextBusinessDateChange(at, 0);
    assert.equal(toBusinessDate(next - 1, 0), '2026-10-31');
    assert.equal(toBusinessDate(next, 0), '2026-11-01');
  });
});

describe('aritmetik', () => {
  test('gün ekleme', () => {
    assert.equal(addDays(BD('2026-08-25'), 1), '2026-08-26');
    assert.equal(addDays(BD('2026-08-31'), 1), '2026-09-01');
    assert.equal(addDays(BD('2026-12-31'), 1), '2027-01-01');
    assert.equal(addDays(BD('2026-08-01'), -1), '2026-07-31');
    assert.equal(addDays(BD('2028-02-28'), 1), '2028-02-29');
    assert.equal(addDays(BD('2027-02-28'), 1), '2027-03-01');
  });

  test('iki gün arası fark', () => {
    assert.equal(daysBetween(BD('2026-08-25'), BD('2026-08-26')), 1);
    assert.equal(daysBetween(BD('2026-08-26'), BD('2026-08-25')), -1);
    assert.equal(daysBetween(BD('2026-08-25'), BD('2026-08-25')), 0);
    assert.equal(daysBetween(BD('2026-01-01'), BD('2027-01-01')), 365);
    assert.equal(daysBetween(BD('2028-01-01'), BD('2029-01-01')), 366);
  });

  test('sıralama', () => {
    assert.equal(compareBusinessDate(BD('2026-08-25'), BD('2026-08-26')), -1);
    assert.equal(compareBusinessDate(BD('2026-08-26'), BD('2026-08-25')), 1);
    assert.equal(compareBusinessDate(BD('2026-08-25'), BD('2026-08-25')), 0);
    const list = ['2026-09-01', '2026-08-25', '2026-12-31'].map(BD);
    assert.deepEqual([...list].sort(), ['2026-08-25', '2026-09-01', '2026-12-31']);
  });

  test('aralıktaki günler', () => {
    const r = businessDatesInRange(BD('2026-08-30'), BD('2026-09-02'));
    assert.deepEqual(r, ['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02']);
    assert.equal(businessDatesInRange(BD('2026-08-25'), BD('2026-08-25')).length, 1);
    assert.equal(businessDatesInRange(BD('2026-08-26'), BD('2026-08-25')).length, 0);
  });
});

describe('dönem sınırları', () => {
  test('ay', () => {
    assert.equal(startOfMonth(BD('2026-08-25')), '2026-08-01');
    assert.equal(endOfMonth(BD('2026-08-25')), '2026-08-31');
    assert.equal(endOfMonth(BD('2026-02-10')), '2026-02-28');
    assert.equal(endOfMonth(BD('2028-02-10')), '2028-02-29');
    assert.equal(endOfMonth(BD('2026-04-10')), '2026-04-30');
  });

  test('aydaki gün sayısı — dönemsel gider dağıtımının girdisi', () => {
    assert.equal(daysInMonth(BD('2026-08-01')), 31);
    assert.equal(daysInMonth(BD('2026-02-01')), 28);
    assert.equal(daysInMonth(BD('2028-02-01')), 29);
    assert.equal(daysInMonth(BD('2026-04-01')), 30);
  });

  test('hafta Pazartesi başlar', () => {
    // 25 Ağustos 2026 bir Salı
    assert.equal(weekdayName(BD('2026-08-25')), 'Salı');
    assert.equal(startOfWeek(BD('2026-08-25')), '2026-08-24');
    assert.equal(endOfWeek(BD('2026-08-25')), '2026-08-30');
  });

  test('Pazar günü haftanın sonudur, başı değil', () => {
    const pazar = BD('2026-08-30');
    assert.equal(weekdayName(pazar), 'Pazar');
    assert.equal(weekdayIndex(pazar), 6);
    assert.equal(startOfWeek(pazar), '2026-08-24');
  });

  test('yıl', () => {
    assert.equal(startOfYear(BD('2026-08-25')), '2026-01-01');
  });
});

describe('biçimlendirme', () => {
  test('stiller', () => {
    const d = BD('2026-08-25');
    assert.equal(formatBusinessDate(d, 'short'), '25.08.2026');
    assert.equal(formatBusinessDate(d, 'long'), '25 Ağustos 2026');
    assert.equal(formatBusinessDate(d, 'dayMonth'), '25 Ağustos');
    assert.equal(formatBusinessDate(d, 'monthYear'), 'Ağustos 2026');
    assert.equal(formatBusinessDate(d, 'weekday'), 'Salı, 25 Ağustos');
    assert.equal(formatBusinessDate(d), '25.08.2026');
  });

  test('tek haneli gün ve ay', () => {
    assert.equal(formatBusinessDate(BD('2026-01-05'), 'short'), '05.01.2026');
    assert.equal(formatBusinessDate(BD('2026-01-05'), 'long'), '5 Ocak 2026');
  });

  test('göreli ifade', () => {
    const bugun = BD('2026-08-25');
    assert.equal(formatRelative(bugun, bugun), 'Bugün');
    assert.equal(formatRelative(BD('2026-08-24'), bugun), 'Dün');
    assert.equal(formatRelative(BD('2026-08-26'), bugun), 'Yarın');
    assert.equal(formatRelative(BD('2026-08-22'), bugun), '3 gün önce');
    assert.equal(formatRelative(BD('2026-08-01'), bugun), '1 Ağustos');
  });
});

describe('bugün', () => {
  test('todayBusinessDate geçerli bir iş günü döner', () => {
    assert.ok(isBusinessDate(todayBusinessDate()));
  });

  test('sabit bir "şimdi" ile deterministik', () => {
    const now = new Date(2026, 7, 25, 1, 0);
    assert.equal(todayBusinessDate(4, now), '2026-08-24');
    assert.equal(todayBusinessDate(0, now), '2026-08-25');
  });
});

describe('formatClock', () => {
  test('iki haneli 24 saat verir', () => {
    const at = new Date(2026, 7, 29, 9, 5).getTime();
    assert.equal(formatClock(at), '09:05');
  });

  test('gece yarısını 00:00 yazar', () => {
    const at = new Date(2026, 7, 29, 0, 0).getTime();
    assert.equal(formatClock(at), '00:00');
  });

  test('öğleden sonrayı 24 saat düzeninde yazar', () => {
    const at = new Date(2026, 7, 29, 19, 14).getTime();
    assert.equal(formatClock(at), '19:14');
  });
});

describe('kısa gün adları', () => {
  test('7 gün, hepsi benzersiz ve uzun adlarla aynı sırada', () => {
    assert.equal(WEEKDAYS_SHORT_TR.length, 7);
    assert.equal(new Set(WEEKDAYS_SHORT_TR).size, 7);
    assert.equal(WEEKDAYS_SHORT_TR[0], 'Pzt');
    assert.equal(WEEKDAYS_SHORT_TR[6], 'Paz');
    WEEKDAYS_SHORT_TR.forEach((kisa, i) => {
      assert.equal(WEEKDAYS_TR[i][0], kisa[0], `${kisa} ↔ ${WEEKDAYS_TR[i]}`);
    });
  });
});
