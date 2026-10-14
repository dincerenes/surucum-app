import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CITIES } from './cities.ts';
import {
  type HourlyProfileKey, type Season, type ZoneKind,
  PUSULA_CITIES, PUSULA_DATA, SEASON_MONTHS,
} from './pusula-data.ts';

// Gerçek veri üzerinde değişmezler. Veri elle (ve ileride araçla)
// güncellenecek; bu testler yeni bir satırın sessizce bozuk girmesini
// engelliyor.

const PROFILES: HourlyProfileKey[] = ['weekday', 'friday', 'saturday', 'sunday'];
const KINDS: ZoneKind[] = [
  'havalimani', 'otogar-gar', 'is-merkezi', 'eglence-gece', 'alisveris', 'universite',
  'turistik', 'hastane', 'sahil', 'konut-yogun', 'etkinlik', 'diger',
];
const SEASONS: Season[] = ['all', 'summer', 'winter', 'school-term'];

/**
 * Büyük harfli kısaltmalar yalnızca bunlar olabilir. Marka adları çoğu
 * zaman büyük harfle yazıldığı için, listede olmayan her kısaltma bir
 * insanın bakması gereken şey.
 */
const ACRONYM_ALLOWLIST = new Set(['AVM', 'AŞTİ', 'YHT', 'ODTÜ']);
const ACRONYM = /[A-ZÇĞİÖŞÜ]{3,}/gu;

const cities = PUSULA_CITIES.map((c) => [c, PUSULA_DATA[c]] as const);
const allZones = cities.flatMap(([city, p]) => p.zones.map((z) => ({ city, z })));

const isIntIn = (v: number, lo: number, hi: number) => Number.isInteger(v) && v >= lo && v <= hi;

describe('şehirler', () => {
  it('her Pusula şehri il listesinde birebir var', () => {
    for (const c of PUSULA_CITIES) assert.ok(CITIES.includes(c), c);
    assert.deepEqual(Object.keys(PUSULA_DATA).sort(), [...PUSULA_CITIES].sort());
  });
});

describe('profiller', () => {
  for (const [city, p] of cities) {
    it(`${city}: uzunluklar ve ölçek`, () => {
      for (const k of PROFILES) {
        assert.equal(p.hourly[k].length, 24, `${k}`);
        for (const v of p.hourly[k]) assert.ok(isIntIn(v, 0, 100), `${k}: ${v}`);
      }
      assert.equal(Math.max(...PROFILES.flatMap((k) => p.hourly[k])), 100, 'en yoğun saat 100');

      assert.equal(p.dayOfWeek.length, 7);
      for (const v of p.dayOfWeek) assert.ok(isIntIn(v, 0, 100), `${v}`);
      assert.equal(Math.max(...p.dayOfWeek), 100, 'en yoğun gün 100');

      assert.equal(p.monthFactor.length, 12);
      for (const f of p.monthFactor) assert.ok(Number.isFinite(f) && f >= 0.7 && f <= 1.3, `${f}`);
    });

    it(`${city}: gece saatleri takvim gününde`, () => {
      // Cuma gecesi 01:00 Cumartesi takviminde; Cumartesi gecesi Pazar'da.
      assert.ok(p.hourly.saturday[1] > p.hourly.friday[1]);
      assert.ok(p.hourly.sunday[1] > p.hourly.weekday[1]);
    });
  }
});

describe('bölgeler', () => {
  for (const [city, p] of cities) {
    it(`${city}: 8–12 bölge, her ay en az 6 tanesi sezonda`, () => {
      assert.ok(p.zones.length >= 8 && p.zones.length <= 12, `${p.zones.length}`);
      for (let m = 0; m < 12; m++) {
        const n = p.zones.filter((z) => SEASON_MONTHS[z.season].includes(m)).length;
        assert.ok(n >= 6, `ay ${m}: ${n}`);
      }
    });
  }

  it('kimlikler benzersiz ve sade', () => {
    const ids = allZones.map(({ z }) => z.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.match(id, /^[a-z0-9-]+$/);
  });

  it('ad, ilçe ve açıklama dolu; açıklama tek satırlık', () => {
    for (const { z } of allZones) {
      assert.ok(z.name.trim().length > 0, z.id);
      assert.ok(z.district.trim().length > 0, z.id);
      assert.ok(z.reason.length >= 1 && z.reason.length <= 70, `${z.id}: ${z.reason.length}`);
    }
  });

  it('pencereler geçerli', () => {
    for (const { z } of allZones) {
      assert.ok(z.windows.length > 0, z.id);
      for (const w of z.windows) {
        const where = `${z.id} ${JSON.stringify(w)}`;
        assert.ok(w.days.length > 0, where);
        assert.equal(new Set(w.days).size, w.days.length, where);
        for (const d of w.days) assert.ok(isIntIn(d, 1, 7), where);
        assert.ok(isIntIn(w.fromHour, 0, 23), where);
        assert.ok(isIntIn(w.toHour, 1, 24), where);
        assert.notEqual(w.toHour, w.fromHour, where);
        assert.ok([1, 2, 3].includes(w.intensity), where);
      }
    }
  });

  it('tür ve sezon tanımlı', () => {
    for (const { z } of allZones) {
      assert.ok(KINDS.includes(z.kind), `${z.id}: ${z.kind}`);
      assert.ok(SEASONS.includes(z.season), `${z.id}: ${z.season}`);
    }
  });

  it('marka izi yok: tescil işareti ve tanımsız kısaltma', () => {
    for (const { z } of allZones) {
      for (const text of [z.name, z.district, z.reason]) {
        assert.ok(!/[®™©]/.test(text), `${z.id}: ${text}`);
        for (const token of text.match(ACRONYM) ?? []) {
          assert.ok(ACRONYM_ALLOWLIST.has(token), `${z.id}: "${token}" listede yok`);
        }
      }
    }
  });
});
