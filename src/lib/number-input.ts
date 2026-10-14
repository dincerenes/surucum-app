/**
 * Sayı alanlarının yazarken biçimlenmesi ve okunması.
 *
 * Sürücü 150000 yazdığında alanda `150.000` görüyor: altı-yedi haneli
 * kilometrede basamakları saymak zor ve bir sıfır eksik ya da fazla
 * kolayca gözden kaçıyor. Biçim Türkiye standardı: NOKTA binlik, VİRGÜL
 * ondalık — uygulamanın her yerinde tutarlar zaten böyle yazılıyor
 * (`1.405,50 ₺`).
 *
 * ZOR KISIM NOKTA. Alandaki noktaları biz koyuyoruz (binlik), ama dili
 * İngilizce olan telefonda ondalık tuşu da nokta basıyor. Bu yüzden iki
 * yol var:
 *
 * - Yazarken (`normalizeTypedNumber`): önceki değer biliniyor. Alandaki
 *   noktaların hepsi bizim; YENİ eklenen bir ayraç ondalıktır.
 * - Dışarıdan gelen değer (`formatNumberInput`, `readDecimal`): önceki
 *   değer yok. Kural `parseAmount` ile aynı: son noktadan sonra tam üç
 *   hane varsa binlik, yoksa ondalık. "1.234" → 1234, "238.5" → 238,5.
 *
 * `normalizeTypedNumber`'ın her çıktısı `formatNumberInput` için sabit
 * nokta: ondalık hep virgül, noktalar hep üç haneli grupların önünde.
 * Alan her çizimde değeri yeniden biçimlese de yazılan kaymıyor.
 *
 * Veritabanı ve arayüz bilmez.
 */

interface Parts {
  int: string;
  /** Ondalık ayraç yazıldıysa ondalık hane dizisi (boş olabilir), yoksa `null`. */
  frac: string | null;
}

const digitsOnly = (s: string) => s.replace(/\D/g, '');

/** Baştaki sıfırlar atılıyor ("007" → "7"), tek sıfır kalıyor ("0,5"). */
const trimLeadingZeros = (s: string) => s.replace(/^0+(?=\d)/, '');

function group(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function join({ int, frac }: Parts, allowDecimal: boolean): string {
  const whole = trimLeadingZeros(int);
  if (!allowDecimal || frac === null) return group(whole);
  return `${group(whole === '' ? '0' : whole)},${frac}`;
}

/**
 * Önceki değeri bilinmeyen metni parçalar. Okunamıyorsa `null`
 * (ör. "1.2.3" — ne binlik ne ondalık).
 */
function splitStandalone(raw: string): Parts | null {
  const s = raw.replace(/\s/g, '');
  const comma = s.lastIndexOf(',');
  if (comma >= 0) {
    return { int: digitsOnly(s.slice(0, comma)), frac: digitsOnly(s.slice(comma + 1)) };
  }
  const dots = s.split('.');
  if (dots.length === 1) return { int: digitsOnly(s), frac: null };

  const groupsAfterFirst = dots.slice(1);
  if (groupsAfterFirst.every((g) => g.length === 3) && dots[0].length > 0) {
    return { int: digitsOnly(dots.join('')), frac: null };
  }
  if (dots.length === 2) {
    return { int: digitsOnly(dots[0]), frac: digitsOnly(dots[1]) };
  }
  return null;
}

/** Dışarıdan gelen değeri alanda gösterilecek biçime getirir. */
export function formatNumberInput(raw: string, allowDecimal: boolean): string {
  if (raw.trim() === '') return '';
  const parts = splitStandalone(raw);
  return parts ? join(parts, allowDecimal) : raw;
}

function countSeparators(s: string): number {
  return (s.match(/[.,]/g) ?? []).length;
}

/**
 * Sürücünün yazdığı yeni metni biçimler. `prev` alanda o an görünen
 * (bizim biçimlediğimiz) metin.
 */
export function normalizeTypedNumber(
  next: string,
  prev: string,
  allowDecimal: boolean,
): string {
  const s = next.replace(/\s/g, '');
  if (s === '') return '';

  const comma = s.indexOf(',');
  if (comma >= 0) {
    return join({
      int: digitsOnly(s.slice(0, comma)),
      // İkinci bir ayraç yazıldıysa yok sayılıyor: "12,5," → "12,5".
      frac: digitsOnly(s.slice(comma + 1)),
    }, allowDecimal);
  }

  // Virgül yok. Yeni bir nokta eklendiyse ondalık tuşudur — en sondaki.
  if (allowDecimal && countSeparators(s) > countSeparators(prev)) {
    const dot = s.lastIndexOf('.');
    return join({ int: digitsOnly(s.slice(0, dot)), frac: digitsOnly(s.slice(dot + 1)) }, true);
  }

  // Kalan noktaların hepsi bizim koyduğumuz binlik ayraçları.
  return join({ int: digitsOnly(s), frac: null }, allowDecimal);
}

/**
 * Alandaki metni sayıya çevirir: "150.000" → 150000, "12,5" → 12.5,
 * "238.5" → 238.5. Boş ya da okunamayan girdi `null` — ASLA sıfıra
 * düşmez; sıfıra düşseydi yanlış yazan sürücü bunu fark etmezdi.
 */
export function readDecimal(raw: string): number | null {
  if (raw.trim() === '') return null;
  // Rakam ve ayraç dışında bir şey varsa okunamaz: "-5" sessizce 5 olmamalı.
  if (/[^\d.,\s]/.test(raw)) return null;
  const parts = splitStandalone(raw);
  if (!parts || (parts.int === '' && !parts.frac)) return null;
  const value = Number(`${parts.int === '' ? '0' : parts.int}.${parts.frac || '0'}`);
  return Number.isFinite(value) ? value : null;
}
