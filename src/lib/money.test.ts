import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  asKurus, fromLira, asBps, percentToBps, bpsToPercent,
  roundHalfAwayFromZero, add, subtract, sum, multiply,
  applyRate, netAfterRate, allocate, allocateByWeights,
  formatKurus, formatKurusCompact, formatBps, formatInteger, formatAmountForInput, formatDecimal,
  parseAmount, parseRate,
  type Kurus,
} from './money.ts';

const K = (n: number) => asKurus(n);

describe('yuvarlama', () => {
  test('sıfırdan uzağa yarım yuvarlar', () => {
    assert.equal(roundHalfAwayFromZero(0.5), 1);
    assert.equal(roundHalfAwayFromZero(1.5), 2);
    assert.equal(roundHalfAwayFromZero(2.5), 3);
    assert.equal(roundHalfAwayFromZero(-0.5), -1);
    assert.equal(roundHalfAwayFromZero(-1.5), -2);
    assert.equal(roundHalfAwayFromZero(-2.5), -3);
  });

  test('JS Math.round negatiflerde farklı davranır — asıl sebep bu', () => {
    assert.equal(Math.round(-0.5), -0);
    assert.equal(roundHalfAwayFromZero(-0.5), -1);
  });
});

describe('oluşturma', () => {
  test('asKurus tam sayı olmayanı reddeder', () => {
    assert.throws(() => asKurus(12.5), TypeError);
    assert.equal(asKurus(1234), 1234);
  });

  test('fromLira lirayı kuruşa çevirir', () => {
    assert.equal(fromLira(12.34), 1234);
    assert.equal(fromLira(0.01), 1);
    assert.equal(fromLira(1000), 100000);
    assert.equal(fromLira(-45.5), -4550);
  });

  test('yüzde baz puana çevrilir', () => {
    assert.equal(percentToBps(25), 2500);
    assert.equal(percentToBps(25.5), 2550);
    assert.equal(percentToBps(0.1), 10);
    assert.equal(bpsToPercent(asBps(2550)), 25.5);
  });
});

describe('aritmetik', () => {
  test('toplama ve çıkarma tam sayıda kalır', () => {
    assert.equal(add(K(1234), K(5678)), 6912);
    assert.equal(subtract(K(10000), K(2500)), 7500);
    assert.equal(sum([K(100), K(200), K(333)]), 633);
    assert.equal(sum([]), 0);
  });

  test('çarpma sonucu yuvarlanır', () => {
    assert.equal(multiply(K(1000), 1.5), 1500);
    assert.equal(multiply(K(333), 0.333), 111);
  });
});

describe('oran uygulama — komisyon hesabı', () => {
  test('temel durum', () => {
    assert.equal(applyRate(K(10000), asBps(2500)), 2500);
    assert.equal(netAfterRate(K(10000), asBps(2500)), 7500);
  });

  test('küsuratlı tutarda kuruş kaybolmaz', () => {
    const gross = K(33333);
    const rate = asBps(1750); // %17,50
    const commission = applyRate(gross, rate);
    const net = netAfterRate(gross, rate);
    assert.equal(commission + net, gross, 'komisyon + net = brüt olmalı');
    assert.ok(Number.isInteger(commission));
  });

  test('sıfır oran ve tam oran', () => {
    assert.equal(applyRate(K(12345), asBps(0)), 0);
    assert.equal(applyRate(K(12345), asBps(10000)), 12345);
    assert.equal(netAfterRate(K(12345), asBps(10000)), 0);
  });

  test('kayan nokta tuzağı: 0,1 + 0,2 sorunu para tarafında yok', () => {
    // Naif yol: 100.10 * 0.07 = 7.006999... → hatalı yuvarlama riski
    assert.equal(applyRate(K(10010), asBps(700)), 701);
  });
});

describe('dağıtım — dönemsel giderin güne bölünmesi', () => {
  test('31 güne bölünen tutar kuruşuna kadar korunur', () => {
    const total = K(100000); // 1000,00 TL
    const daily = allocate(total, 31);
    assert.equal(daily.length, 31);
    assert.equal(sum(daily), total);
    assert.equal(daily[0], 3226);
    assert.equal(daily[30], 3225);
  });

  test('naif bölme kaybederdi', () => {
    const naive = Math.floor(100000 / 31) * 31;
    assert.notEqual(naive, 100000);
    assert.equal(naive, 99975); // 25 kuruş buharlaşırdı
  });

  test('tam bölünen durum', () => {
    const d = allocate(K(3000), 30);
    assert.deepEqual(new Set(d), new Set([100]));
    assert.equal(sum(d), 3000);
  });

  test('negatif tutar', () => {
    const d = allocate(K(-100000), 31);
    assert.equal(sum(d), -100000);
    assert.equal(d[0], -3226);
  });

  test('tek parça', () => {
    assert.deepEqual(allocate(K(777), 1), [777]);
  });

  test('geçersiz parça sayısı reddedilir', () => {
    assert.throws(() => allocate(K(100), 0), RangeError);
    assert.throws(() => allocate(K(100), -1), RangeError);
    assert.throws(() => allocate(K(100), 2.5), RangeError);
  });

  test('ağırlıklı dağıtım toplamı korur', () => {
    const parts = allocateByWeights(K(100000), [1, 2, 3]);
    assert.equal(sum(parts), 100000);
    assert.equal(parts.length, 3);
    assert.ok(parts[2] > parts[1] && parts[1] > parts[0]);
  });

  test('ağırlıklı dağıtım — bölünmeyen durum', () => {
    const parts = allocateByWeights(K(100), [1, 1, 1]);
    assert.equal(sum(parts), 100);
    assert.deepEqual(parts.slice().sort((a, b) => a - b), [33, 33, 34]);
  });

  test('sıfır ağırlık eşit dağıtıma düşer', () => {
    const parts = allocateByWeights(K(90), [0, 0, 0]);
    assert.equal(sum(parts), 90);
  });
});

describe('biçimlendirme', () => {
  test('Türkçe para biçimi', () => {
    assert.equal(formatKurus(K(123456)), '1.234,56 ₺');
    assert.equal(formatKurus(K(0)), '0,00 ₺');
    assert.equal(formatKurus(K(5)), '0,05 ₺');
    assert.equal(formatKurus(K(100)), '1,00 ₺');
    // Tipografik eksi (U+2212), düz tire değil — rakamlarla hizalı dursun
    assert.equal(formatKurus(K(-123456)), '\u22121.234,56 ₺');
    assert.equal(formatKurus(K(123456789)), '1.234.567,89 ₺');
  });

  test('seçenekler', () => {
    assert.equal(formatKurus(K(123456), { symbol: false }), '1.234,56');
    assert.equal(formatKurus(K(123456), { decimals: false }), '1.235 ₺');
    assert.equal(formatKurus(K(123400), { decimals: false }), '1.234 ₺');
    assert.equal(formatKurus(K(123456), { sign: 'always' }), '+1.234,56 ₺');
    assert.equal(formatKurus(K(-123456), { sign: 'always' }), '\u22121.234,56 ₺');
  });

  test('kısa biçim', () => {
    assert.equal(formatKurusCompact(K(1_250_000)), '12,5 B ₺');
    assert.equal(formatKurusCompact(K(100_000_000)), '1 Mn ₺');
    assert.equal(formatKurusCompact(K(45000)), '450 ₺');
  });

  test('oran biçimi', () => {
    assert.equal(formatBps(asBps(2500)), '%25');
    assert.equal(formatBps(asBps(2550)), '%25,5');
    assert.equal(formatBps(asBps(0)), '%0');
  });
});

describe('girdi okuma — sürücü hızlı yazar, biçim tutarsızdır', () => {
  const cases: [string, number | null][] = [
    ['1.234,56', 123456],
    ['1234,56', 123456],
    ['1234.56', 123456],
    ['1.234', 123400],
    ['1.23', 123],
    ['1.2', 120],
    ['450', 45000],
    ['0', 0],
    ['0,05', 5],
    [',5', 50],
    ['1.234,56 ₺', 123456],
    ['₺1.234,56', 123456],
    ['1234,56 TL', 123456],
    ['-450', -45000],
    ['\u2212450', -45000],        // tipografik eksi de okunuyor
    ['\u22121.234,56 ₺', -123456], // biçimlendirilmiş tutar geri okunabiliyor
    ['1,234.56', 123456],
    ['1.234.567', 123456700],
    ['1,999', 200],
    ['0,005', 1],
    ['0,004', 0],
    ['', null],
    ['abc', null],
    ['12a', null],
    ['   ', null],
  ];

  for (const [input, expected] of cases) {
    test(`"${input}" → ${expected}`, () => {
      assert.equal(parseAmount(input), expected);
    });
  }

  test('okunamayan girdi sessizce sıfıra düşmez', () => {
    assert.equal(parseAmount('yok'), null);
    assert.notEqual(parseAmount('yok'), 0);
  });

  test('oran okuma', () => {
    assert.equal(parseRate('25'), 2500);
    assert.equal(parseRate('%25'), 2500);
    assert.equal(parseRate('25,5'), 2550);
    assert.equal(parseRate('0'), 0);
    assert.equal(parseRate('100'), 10000);
    assert.equal(parseRate('101'), null, '%100 üstü reddedilmeli');
    assert.equal(parseRate('-5'), null);
    assert.equal(parseRate('abc'), null);
  });
});

describe('formatInteger — para olmayan tam sayılar', () => {
  it('binlik ayracı NOKTA, Türkçe biçim', () => {
    assert.equal(formatInteger(1234), '1.234');
    assert.equal(formatInteger(1234567), '1.234.567');
  });

  it('dört haneden kısa sayıda ayraç yok', () => {
    assert.equal(formatInteger(0), '0');
    assert.equal(formatInteger(999), '999');
  });

  it('ondalık yuvarlanıyor — kilometre tam sayı gösterilir', () => {
    assert.equal(formatInteger(238.6), '239');
    assert.equal(formatInteger(238.4), '238');
  });

  it('negatifte tipografik eksi kullanılıyor, düz tire değil', () => {
    assert.equal(formatInteger(-1234), '−1.234');
  });

  it('bozuk girdi çökmüyor', () => {
    assert.equal(formatInteger(NaN), '0');
    assert.equal(formatInteger(Infinity), '0');
  });
});

describe('formatAmountForInput — düzenleme alanı', () => {
  it('kuruşsuz tutar tam sayı yazılır', () => {
    assert.equal(formatAmountForInput(K(25000)), '250');
  });

  it('kuruşlu tutar virgülle yazılır', () => {
    assert.equal(formatAmountForInput(K(18750)), '187,50');
    assert.equal(formatAmountForInput(K(5)), '0,05');
  });

  it('BİNLİK AYRACI YOK — girdi alanı ham sayı tutar', () => {
    assert.equal(formatAmountForInput(K(231050)), '2310,50');
  });

  it('parseAmount gidiş-dönüş değeri korur', () => {
    for (const v of [0, 5, 100, 18750, 231050, 99999999]) {
      assert.equal(parseAmount(formatAmountForInput(K(v))), v, `değer: ${v}`);
    }
  });

  it('boş ve bozuk girdi boş metin', () => {
    assert.equal(formatAmountForInput(null), '');
    assert.equal(formatAmountForInput(undefined), '');
    assert.equal(formatAmountForInput(NaN), '');
  });
});

describe('formatDecimal — ondalık ayracı VİRGÜL', () => {
  it('Türkçe ayraç kullanır, nokta değil', () => {
    assert.equal(formatDecimal(17.85), '17,9');
    assert.equal(formatDecimal(7.5), '7,5');
  });

  it('binlik ayracı nokta, ondalık virgül', () => {
    assert.equal(formatDecimal(1234.56), '1.234,6');
  });

  it('basamak sayısı ayarlanabilir', () => {
    assert.equal(formatDecimal(17.849, 2), '17,85');
    assert.equal(formatDecimal(17.5, 0), '18');
  });

  it('negatifte tipografik eksi', () => {
    assert.equal(formatDecimal(-3.2), '−3,2');
  });

  it('bozuk girdi çökmüyor', () => {
    assert.equal(formatDecimal(NaN), '0');
    assert.equal(formatDecimal(Infinity), '0');
  });
});
