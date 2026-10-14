import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { asBusinessDate } from './business-date.ts';
import {
  formatMonthKey, isMonthKey, monthKeyOf, monthRange, monthsBetween, periodBounds,
  previousPeriodLabel, type MonthKey,
} from './period.ts';

const BD = asBusinessDate;
const today = BD('2026-09-23'); // Çarşamba

describe('periodBounds', () => {
  it('bu hafta Pazartesi başlar, bitiş bugün; önceki hafta AYNI günler', () => {
    assert.deepEqual(periodBounds('week', today, null), {
      from: BD('2026-09-21'), to: today,
      previousFrom: BD('2026-09-14'), previousTo: BD('2026-09-16'),
    });
  });

  it('bu ay ayın 1\'inden; önceki ayın ilk AYNI sayıda günü', () => {
    assert.deepEqual(periodBounds('month', today, null), {
      from: BD('2026-09-01'), to: today,
      previousFrom: BD('2026-08-01'), previousTo: BD('2026-08-23'),
    });
  });

  it('31 günlük ayın 31\'i: 30 günlük önceki ay sonunda durur', () => {
    const r = periodBounds('month', BD('2026-10-31'), null);
    assert.equal(r.previousFrom, BD('2026-09-01'));
    assert.equal(r.previousTo, BD('2026-09-30'));
    // Mart'ın 30'u, Şubat'ın 28'inde durur.
    assert.equal(periodBounds('month', BD('2026-03-30'), null).previousTo, BD('2026-02-28'));
  });

  it('bu yıl 1 Ocak\'tan; geçen yılın AYNI tarihine kadar', () => {
    assert.deepEqual(periodBounds('year', today, null), {
      from: BD('2026-01-01'), to: today,
      previousFrom: BD('2025-01-01'), previousTo: BD('2025-09-23'),
    });
    // 29 Şubat'ın geçen yıldaki karşılığı 28 Şubat.
    assert.equal(periodBounds('year', BD('2028-02-29'), null).previousTo, BD('2027-02-28'));
  });

  it('pazar günü hafta, ayın son günü ay: önceki dönem tam', () => {
    assert.equal(periodBounds('week', BD('2026-09-27'), null).previousTo, BD('2026-09-20'));
    assert.equal(periodBounds('month', BD('2026-09-30'), null).previousTo, BD('2026-08-31'));
    assert.equal(periodBounds('year', BD('2026-12-31'), null).previousTo, BD('2025-12-31'));
  });

  it('tüm zamanlar ilk kayıttan; kayıt yoksa bugün; öncesi yok', () => {
    assert.deepEqual(periodBounds('all', today, BD('2025-03-10')), {
      from: BD('2025-03-10'), to: today, previousFrom: null, previousTo: null,
    });
    assert.equal(periodBounds('all', today, null).from, today);
  });
});

describe('previousPeriodLabel', () => {
  const label = (p: 'week' | 'month' | 'year' | 'all', d: string) =>
    previousPeriodLabel(p, periodBounds(p, BD(d), null));

  it('kısmi karşılaştırma adıyla söylenir', () => {
    assert.equal(label('week', '2026-09-23'), 'Geçen hafta aynı günler');
    assert.equal(label('month', '2026-10-10'), 'Geçen ayın ilk 10 günü');
    assert.equal(label('year', '2026-10-10'), 'Geçen yıl aynı dönem');
  });

  it('önceki dönem tamamıyla alındıysa kısa ad', () => {
    assert.equal(label('week', '2026-09-27'), 'Geçen hafta');
    assert.equal(label('month', '2026-10-31'), 'Geçen ay');
    assert.equal(label('year', '2026-12-31'), 'Geçen yıl');
  });

  it('tüm zamanlarda yok', () => {
    assert.equal(label('all', '2026-10-10'), null);
  });
});

describe('aylık arşiv', () => {
  it('aylar en yeni önce, iki uç dahil, yıl sınırını geçer', () => {
    assert.deepEqual(monthsBetween(BD('2025-11-20'), BD('2026-02-03')),
      ['2026-02', '2026-01', '2025-12', '2025-11']);
    assert.deepEqual(monthsBetween(BD('2026-09-05'), BD('2026-09-23')), ['2026-09']);
  });

  it('ayın sınırları — Şubat ve artık yıl', () => {
    assert.deepEqual(monthRange('2026-02'), { from: BD('2026-02-01'), to: BD('2026-02-28') });
    assert.deepEqual(monthRange('2028-02'), { from: BD('2028-02-01'), to: BD('2028-02-29') });
  });

  it('bozuk anahtar reddedilir — adresten geliyor', () => {
    for (const bad of ['2026-13', '2026-1', 'abc', '', '2026-09-01']) {
      assert.equal(isMonthKey(bad), false, bad);
      assert.equal(monthRange(bad), null, bad);
    }
  });

  it('anahtar ve ad', () => {
    assert.equal(monthKeyOf(BD('2026-06-15')), '2026-06');
    assert.equal(formatMonthKey('2026-06' as MonthKey), 'Haziran 2026');
  });
});
