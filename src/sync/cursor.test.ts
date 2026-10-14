import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PULL_START, compareKeys, keyFilter, lookbackKey, maxKey, sameKey, tsMicros,
} from './cursor.ts';

const key = (ts: string, id = '0199a000-0000-7000-8000-000000000001') => ({ ts, id });

describe('tsMicros', () => {
  it('mikrosaniyeyi KAYBETMEZ', () => {
    const a = tsMicros('2026-09-19T10:00:00.123100+00:00');
    const b = tsMicros('2026-09-19T10:00:00.123900+00:00');
    assert.notEqual(a, b);
    assert.equal((b as number) - (a as number), 800);
  });

  it('kesir haneleri eksik olabilir', () => {
    assert.equal(
      tsMicros('2026-09-19T10:00:00.12+00:00'),
      (tsMicros('2026-09-19T10:00:00+00:00') as number) + 120_000,
    );
  });

  it('Z ve ofset aynı anı verir', () => {
    assert.equal(
      tsMicros('2026-09-19T10:00:00Z'),
      tsMicros('2026-09-19T13:00:00+03:00'),
    );
  });

  it('çözümlenemeyen damga null döner', () => {
    assert.equal(tsMicros('bozuk'), null);
    assert.equal(tsMicros(''), null);
    assert.equal(tsMicros('2026-09-19 10:00:00'), null);
  });
});

describe('compareKeys', () => {
  it('aynı milisaniyedeki mikrosaniye farkını görür', () => {
    assert.equal(compareKeys(
      key('2026-09-19T10:00:00.123900+00:00'), key('2026-09-19T10:00:00.123100+00:00'),
    ), 1);
  });

  it('damga eşitse kimlik sırası belirler', () => {
    const ts = '2026-09-19T10:00:00.123456+00:00';
    assert.equal(compareKeys({ ts, id: 'a' }, { ts, id: 'b' }), -1);
    assert.equal(compareKeys({ ts, id: 'b' }, { ts, id: 'b' }), 0);
  });

  it('bozuk damga sessizce geçmez, hata verir', () => {
    assert.throws(() => compareKeys(key('bozuk'), PULL_START), /çözümlenemedi/);
  });

  it('maxKey geri gitmez', () => {
    const early = key('2026-09-19T10:00:00+00:00');
    const late = key('2026-09-19T11:00:00+00:00');
    assert.equal(maxKey(late, early), late);
    assert.equal(maxKey(early, late), late);
  });
});

describe('keyFilter', () => {
  it('değerleri tırnaklar — damgadaki + ve : ayrılmış karakterler', () => {
    assert.equal(
      keyFilter({ ts: '2026-09-19T10:00:00.123456+00:00', id: 'abc' }),
      'server_updated_at.gt."2026-09-19T10:00:00.123456+00:00",'
      + 'and(server_updated_at.eq."2026-09-19T10:00:00.123456+00:00",id.gt."abc")',
    );
  });
});

describe('lookbackKey', () => {
  it('pencereyi damgadan geriye alır ve kimliği sıfırlar', () => {
    const back = lookbackKey(key('2026-09-19T10:00:00.123456+00:00'), 120_000);
    assert.equal(back.ts, '2026-09-19T09:58:00.123456+00:00');
    assert.equal(back.id, PULL_START.id);
  });

  it('hiç çekilmemiş tablo başlangıçta kalır', () => {
    assert.ok(sameKey(lookbackKey(PULL_START, 120_000), PULL_START));
  });

  it('epoch civarında negatife düşmez', () => {
    assert.equal(lookbackKey(key('1970-01-01T00:00:01+00:00'), 120_000).ts,
      '1970-01-01T00:00:00.000000+00:00');
  });
});
