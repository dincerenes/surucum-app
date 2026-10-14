import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatNumberInput, normalizeTypedNumber, readDecimal } from './number-input.ts';

/** Sürücünün tuş tuş yazmasını taklit eder. */
function typeKeys(keys: string, allowDecimal: boolean): string {
  let shown = '';
  for (const k of keys) shown = normalizeTypedNumber(shown + k, shown, allowDecimal);
  return shown;
}

/** Sondan bir karakter siler. */
function backspace(shown: string, allowDecimal: boolean): string {
  return normalizeTypedNumber(shown.slice(0, -1), shown, allowDecimal);
}

describe('normalizeTypedNumber — kilometre (tam sayı)', () => {
  it('yazılırken basamaklar noktayla ayrılır', () => {
    assert.equal(typeKeys('150000', false), '150.000');
    assert.equal(typeKeys('1234567', false), '1.234.567');
    assert.equal(typeKeys('999', false), '999');
  });

  it('silerken gruplar yeniden kurulur', () => {
    assert.equal(backspace('1.234.567', false), '123.456');
    assert.equal(backspace('1.000', false), '100');
  });

  it('tam sayı alanında ondalık yazılamaz', () => {
    assert.equal(typeKeys('12,5', false), '125');
  });
});

describe('normalizeTypedNumber — tutar (ondalık)', () => {
  it('Türkçe klavye: virgül ondalık, noktalar binlik', () => {
    assert.equal(typeKeys('12500,5', true), '12.500,5');
    assert.equal(typeKeys('12,', true), '12,');
    assert.equal(typeKeys(',5', true), '0,5');
  });

  it('İngilizce klavye: ondalık tuşunun noktası virgüle döner', () => {
    assert.equal(typeKeys('12.5', true), '12,5');
    assert.equal(typeKeys('1234.5', true), '1.234,5');
  });

  it('bizim koyduğumuz nokta ondalık sanılmaz', () => {
    // "1.234" görünürken 5'e basmak "1,2345" değil "12.345" olmalı.
    assert.equal(normalizeTypedNumber('1.2345', '1.234', true), '12.345');
    assert.equal(backspace('1.234', true), '123');
  });

  it('ikinci ondalık ayracı yok sayılır', () => {
    assert.equal(typeKeys('12,5,', true), '12,5');
  });
});

describe('formatNumberInput', () => {
  it('dışarıdan gelen değer biçimlenir', () => {
    assert.equal(formatNumberInput('150000', false), '150.000');
    assert.equal(formatNumberInput('1234,5', true), '1.234,5');
    assert.equal(formatNumberInput('7,5', true), '7,5');
    assert.equal(formatNumberInput('', true), '');
  });

  it('yazma yolunun çıktısı sabit nokta — yeniden biçimlemek kaydırmaz', () => {
    for (const keys of ['150000', '12500,5', '1234.5', '12,', ',5']) {
      const shown = typeKeys(keys, true);
      assert.equal(formatNumberInput(shown, true), shown, keys);
    }
  });
});

describe('readDecimal', () => {
  it('noktalı binlik ve virgüllü ondalık okunur', () => {
    assert.equal(readDecimal('150.000'), 150000);
    assert.equal(readDecimal('1.234.567'), 1234567);
    assert.equal(readDecimal('12,5'), 12.5);
    assert.equal(readDecimal('1.234,5'), 1234.5);
  });

  it('tek noktadan sonra üç hane yoksa nokta ondalıktır', () => {
    assert.equal(readDecimal('238.5'), 238.5);
    assert.equal(readDecimal('7.25'), 7.25);
  });

  it('boş ve okunamayan null — sıfıra düşmez', () => {
    assert.equal(readDecimal(''), null);
    assert.equal(readDecimal('  '), null);
    assert.equal(readDecimal('1.2.3'), null);
    assert.equal(readDecimal(','), null);
    assert.equal(readDecimal('-5'), null);
    assert.equal(readDecimal('12a'), null);
  });
});
