/**
 * PARA — Sürücüm'ün en katı kuralı.
 *
 * Uygulamada hiçbir tutar kayan noktalı sayı olarak taşınmaz. Her tutar
 * TAM SAYI KURUŞ'tur. `Kurus` markalı bir tip olduğu için, lira cinsinden
 * bir sayıyı kuruş bekleyen bir yere geçirmek derleme hatası verir.
 *
 * Oranlar da kayan nokta değil: komisyon oranları BAZ PUAN (basis point)
 * olarak tutulur. 2500 baz puan = %25,00. Böylece 0.25 gibi bir ondalık
 * hiçbir zaman çarpıma girmez.
 */

declare const KURUS_BRAND: unique symbol;
declare const BPS_BRAND: unique symbol;

/** Tam sayı kuruş. 1 TL = 100 kuruş. */
export type Kurus = number & { readonly [KURUS_BRAND]: true };

/** Baz puan. %100 = 10000 baz puan. */
export type BasisPoints = number & { readonly [BPS_BRAND]: true };

export const KURUS_PER_LIRA = 100;
export const BPS_PER_UNIT = 10_000;

export const ZERO = 0 as Kurus;

/** JS'in güvenli tam sayı sınırı içinde kalıyor muyuz? */
function assertSafe(n: number, what: string): void {
  if (!Number.isSafeInteger(n)) {
    throw new RangeError(`${what} güvenli tam sayı aralığının dışında: ${n}`);
  }
}

// ---------------------------------------------------------------------------
// Oluşturma
// ---------------------------------------------------------------------------

/** Ham bir tam sayıyı kuruş olarak işaretler. Veritabanı sınırında kullanılır. */
export function asKurus(n: number): Kurus {
  if (!Number.isInteger(n)) {
    throw new TypeError(`Kuruş tam sayı olmalı, alınan: ${n}`);
  }
  assertSafe(n, 'Kuruş değeri');
  return n as Kurus;
}

/**
 * Lira cinsinden bir sayıdan kuruş üretir. Yalnızca sabitler ve testler için;
 * kullanıcı girdisi `parseAmount` ile okunmalı.
 */
export function fromLira(lira: number): Kurus {
  return asKurus(roundHalfAwayFromZero(lira * KURUS_PER_LIRA));
}

/** Yüzdeyi baz puana çevirir. percentToBps(25.5) === 2550 */
export function percentToBps(percent: number): BasisPoints {
  return asBps(roundHalfAwayFromZero(percent * 100));
}

export function asBps(n: number): BasisPoints {
  if (!Number.isInteger(n)) {
    throw new TypeError(`Baz puan tam sayı olmalı, alınan: ${n}`);
  }
  return n as BasisPoints;
}

export function bpsToPercent(bps: BasisPoints): number {
  return bps / 100;
}

/**
 * Oranı geçerli aralığa (0–10000, yani %0–%100) sıkıştırır.
 *
 * BU YEREL BİR ZEVK MESELESİ DEĞİL: bulut tarafında
 * `check (commission_bps between 0 and 10000)` kısıtı var, SQLite'ta yok.
 * Aralık dışı bir oran cihaza sorunsuz yazılır, sonra senkronda kalıcı
 * olarak reddedilir — kayıt kuyrukta sonsuza kadar döner ve sürücü
 * verisinin buluta gitmediğini asla öğrenemez.
 *
 * Yazma yolundaki her oran buradan geçmek zorunda.
 */
export function clampBps(n: number): BasisPoints {
  if (!Number.isFinite(n)) return 0 as BasisPoints;
  const whole = roundHalfAwayFromZero(n);
  return Math.min(BPS_PER_UNIT, Math.max(0, whole)) as BasisPoints;
}

// ---------------------------------------------------------------------------
// Yuvarlama
// ---------------------------------------------------------------------------

/**
 * Sıfırdan uzağa yarım yuvarlama: 0,5 → 1 ve -0,5 → -1.
 * JS'in Math.round'u negatiflerde yukarı yuvarlar (-0,5 → -0), bu da
 * gider tutarlarında bir kuruşluk kaymalara yol açar.
 */
export function roundHalfAwayFromZero(x: number): number {
  return x < 0 ? -Math.round(-x) : Math.round(x);
}

// ---------------------------------------------------------------------------
// Aritmetik
// ---------------------------------------------------------------------------

export function add(...values: Kurus[]): Kurus {
  let total = 0;
  for (const v of values) total += v;
  assertSafe(total, 'Toplam');
  return total as Kurus;
}

export function subtract(a: Kurus, b: Kurus): Kurus {
  const r = a - b;
  assertSafe(r, 'Fark');
  return r as Kurus;
}

export function negate(a: Kurus): Kurus {
  return -a as Kurus;
}

export function abs(a: Kurus): Kurus {
  return Math.abs(a) as Kurus;
}

export function multiply(a: Kurus, factor: number): Kurus {
  return asKurus(roundHalfAwayFromZero(a * factor));
}

export function sum(values: readonly Kurus[]): Kurus {
  let total = 0;
  for (const v of values) total += v;
  assertSafe(total, 'Toplam');
  return total as Kurus;
}

/**
 * Bir tutara oran uygular. Komisyon hesabının tek yolu budur.
 * applyRate(10000 kuruş, 2500 bps) === 2500 kuruş
 *
 * `a * bps` her zaman tam sayı çarpımıdır, yani ara sonuçta kayan nokta
 * hatası oluşmaz.
 */
export function applyRate(amount: Kurus, rate: BasisPoints): Kurus {
  const product = amount * rate;
  assertSafe(product, 'Oran çarpımı');
  return asKurus(roundHalfAwayFromZero(product / BPS_PER_UNIT));
}

/** Komisyon düşülmüş net tutar. net = brüt − applyRate(brüt, oran) */
export function netAfterRate(gross: Kurus, rate: BasisPoints): Kurus {
  return subtract(gross, applyRate(gross, rate));
}

/**
 * Bir tutarı n parçaya, tek kuruş bile kaybetmeden böler.
 * Parçaların toplamı her zaman tam olarak `total`'a eşittir.
 *
 * Aylık plaka kirasını güne dağıtırken bu şart: 1000,00 TL / 31 gün
 * naif bölmeyle 999,98 TL'ye toplanır ve aylık rapor tutmaz.
 *
 * Artan kuruşlar baştaki parçalara dağıtılır (en büyük kalan yöntemi).
 */
export function allocate(total: Kurus, parts: number): Kurus[] {
  if (!Number.isInteger(parts) || parts <= 0) {
    throw new RangeError(`Parça sayısı pozitif tam sayı olmalı, alınan: ${parts}`);
  }
  const sign = total < 0 ? -1 : 1;
  const magnitude = Math.abs(total);
  const base = Math.floor(magnitude / parts);
  const remainder = magnitude - base * parts;

  const out: Kurus[] = new Array(parts);
  for (let i = 0; i < parts; i++) {
    out[i] = (sign * (base + (i < remainder ? 1 : 0))) as Kurus;
  }
  return out;
}

/**
 * Bir tutarı verilen ağırlıklara göre, kuruş kaybetmeden paylaştırır.
 * Ağırlıkların toplamı sıfırsa eşit dağıtıma düşer.
 */
export function allocateByWeights(total: Kurus, weights: readonly number[]): Kurus[] {
  if (weights.length === 0) return [];
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (totalWeight <= 0) return allocate(total, weights.length);

  const sign = total < 0 ? -1 : 1;
  const magnitude = Math.abs(total);

  const raw = weights.map((w) => (magnitude * w) / totalWeight);
  const floors = raw.map((r) => Math.floor(r));
  let distributed = floors.reduce((s, f) => s + f, 0);
  let leftover = magnitude - distributed;

  // Kalanı, ondalık artığı en büyük olanlardan başlayarak dağıt.
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const out = floors.slice();
  for (let k = 0; k < order.length && leftover > 0; k++) {
    out[order[k].i] += 1;
    leftover -= 1;
  }
  return out.map((v) => (sign * v) as Kurus);
}

// ---------------------------------------------------------------------------
// Türetilmiş oranlar — bunlar para değil, ondalık sayı döner
// ---------------------------------------------------------------------------

/** Kuruş cinsinden tutarı, birim başına kuruşa böler (örn. TL/km, TL/saat). */
export function ratePerUnit(amount: Kurus, units: number): number | null {
  if (!Number.isFinite(units) || units === 0) return null;
  return amount / units;
}

// ---------------------------------------------------------------------------
// Biçimlendirme
// ---------------------------------------------------------------------------

export interface FormatOptions {
  /** ₺ simgesi eklensin mi? Varsayılan: true */
  symbol?: boolean;
  /** Kuruş haneleri gösterilsin mi? Varsayılan: true */
  decimals?: boolean;
  /** 'auto' yalnızca eksiyi gösterir, 'always' artıyı da gösterir. */
  sign?: 'auto' | 'always';
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Para OLMAYAN tam sayılar için binlik ayracı: 1234 → "1.234"
 *
 * `toLocaleString('tr-TR')` KULLANILMIYOR. Hermes'in ICU verisi platforma
 * göre eksik olabiliyor ve locale yok sayıldığında çıktı "1,234" oluyor —
 * Türkçe okuyan bir sürücü bunu bin iki yüz otuz dört değil, bir virgül
 * iki üç dört diye okur. Kilometre ve sayaç değerleri para kadar kritik
 * değil ama aynı ekranda paranın yanında duruyorlar; iki farklı ayraç
 * görmek sayının tamamına olan güveni sarsıyor.
 */
export function formatInteger(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value);
  const negative = rounded < 0;
  const body = groupThousands(String(Math.abs(rounded)));
  return negative ? `${MINUS}${body}` : body;
}

/**
 * Türkçe para biçimi: 1.234,56 ₺
 *
 * Intl yerine elle biçimlendiriyoruz çünkü Hermes'in Intl desteği
 * platforma göre değişiyor ve para biçiminin her cihazda aynı görünmesi
 * gerekiyor.
 */
/**
 * Eksi işareti — düz tire değil, TİPOGRAFİK EKSİ (U+2212).
 *
 * Düz tire rakamlardan belirgin biçimde dar ve alçak duruyor; alt alta
 * sıralanan tutarlarda hizayı bozuyor ve okunurluğu düşürüyor. Ayrıca
 * gider satırlarında elle konan eksiyle biçim tutarsızlığı çıkıyordu.
 */
const MINUS = '\u2212';

export function formatKurus(value: Kurus | number, opts: FormatOptions = {}): string {
  const { symbol = true, decimals = true, sign = 'auto' } = opts;
  const v = Math.trunc(value);
  const negative = v < 0;
  const magnitude = Math.abs(v);

  let body: string;
  if (decimals) {
    const whole = Math.floor(magnitude / KURUS_PER_LIRA);
    const cents = magnitude % KURUS_PER_LIRA;
    body = `${groupThousands(String(whole))},${String(cents).padStart(2, '0')}`;
  } else {
    const whole = Math.round(magnitude / KURUS_PER_LIRA);
    body = groupThousands(String(whole));
  }

  const prefix = negative ? MINUS : sign === 'always' ? '+' : '';
  return symbol ? `${prefix}${body} ₺` : `${prefix}${body}`;
}

/** Grafik ekseni gibi dar yerler için: 12,5 B ₺ / 1,2 Mn ₺ */
export function formatKurusCompact(value: Kurus | number, symbol = true): string {
  const v = Math.trunc(value);
  const negative = v < 0;
  const lira = Math.abs(v) / KURUS_PER_LIRA;

  let body: string;
  if (lira >= 1_000_000) body = `${trimZero(lira / 1_000_000)} Mn`;
  else if (lira >= 1_000) body = `${trimZero(lira / 1_000)} B`;
  else body = trimZero(lira);

  const prefix = negative ? MINUS : '';
  return symbol ? `${prefix}${body} ₺` : `${prefix}${body}`;
}

function trimZero(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace('.', ',');
}

/**
 * Para OLMAYAN ondalık sayı: 17.85 → "17,9"
 *
 * Türkçede ondalık ayracı VİRGÜL. `toFixed()` çıktısı nokta veriyor ve
 * ekranda "17.9 lt" diye görünüyordu — aynı ekranda paranın "892,50 ₺"
 * olduğu yerde. İki farklı ayraç, sürücünün hangi işaretin ne anlama
 * geldiğini sorgulaması demek; gerçek cihazda görülüp düzeltildi.
 *
 * Binlik ayracı da ekleniyor: uzun dönemde kilometre binlere çıkıyor.
 */
export function formatDecimal(value: number, digits: number = 1): string {
  if (!Number.isFinite(value)) return '0';
  const negative = value < 0;
  const fixed = Math.abs(value).toFixed(digits);
  const [whole, frac] = fixed.split('.');
  const body = frac ? `${groupThousands(whole)},${frac}` : groupThousands(whole);
  return negative ? `${MINUS}${body}` : body;
}

/**
 * Tutarın DÜZENLENEBİLİR metin hâli: 23150 → "231,50"
 *
 * `formatKurus` KULLANILMAZ. Onun çıktısı binlik ayracı ve ₺ taşıyor;
 * "2.310,50 ₺" metnini bir giriş alanına koyup sürücünün rakamın
 * ortasına dokunmasını istediğimizde ayraç yerinde kalıyor ve girdi
 * bozuluyor. Düzenleme alanı ham sayı tutar, gösterim değil.
 *
 * `parseAmount` bu çıktıyı aynen geri okur — gidiş-dönüş değeri korur.
 */
export function formatAmountForInput(value: Kurus | number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  const v = Math.trunc(value);
  const negative = v < 0;
  const magnitude = Math.abs(v);
  const whole = Math.floor(magnitude / KURUS_PER_LIRA);
  const cents = magnitude % KURUS_PER_LIRA;
  const body = cents === 0
    ? String(whole)
    : `${whole},${String(cents).padStart(2, '0')}`;
  return negative ? `-${body}` : body;
}

/** Oranı yüzde olarak biçimlendirir: 2550 bps → "%25,5" */
export function formatBps(bps: BasisPoints): string {
  const pct = bps / 100;
  const rounded = Math.round(pct * 100) / 100;
  return `%${String(rounded).replace('.', ',')}`;
}

// ---------------------------------------------------------------------------
// Kullanıcı girdisini okuma
// ---------------------------------------------------------------------------

/**
 * Kullanıcının yazdığı tutarı kuruşa çevirir. Sürücü hızlı yazar ve
 * biçim tutarlı olmaz — hepsini kabul etmemiz gerekiyor:
 *
 *   "1.234,56"  → 123456   (TR: nokta binlik, virgül ondalık)
 *   "1234,56"   → 123456
 *   "1234.56"   → 123456   (nokta ondalık olarak yazılmış)
 *   "1.234"     → 123400   (üç haneli son grup → binlik ayraç)
 *   "1.23"      → 123      (iki haneli son grup → ondalık)
 *   "1.234,56 ₺"→ 123456
 *   "450"       → 45000
 *
 * Okunamayan girdide null döner — sessizce 0'a düşmez.
 */
export function parseAmount(input: string): Kurus | null {
  if (typeof input !== 'string') return null;

  let s = input
    .trim()
    .replace(/[₺\s]/g, '')
    .replace(/TL/gi, '');
  if (!s) return null;

  let negative = false;
  /**
   * Hem düz tire hem TİPOGRAFİK EKSİ kabul ediliyor.
   *
   * `formatKurus` tipografik eksi üretiyor; biçimlendirilmiş bir tutar
   * alana geri konup düzenlenirse (ön dolgulu alanlar böyle çalışıyor)
   * düz tire beklemek girdiyi okunamaz yapardı ve `null` dönerdi.
   */
  if (s.startsWith('-') || s.startsWith(MINUS)) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }

  if (!/^[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  let intPart: string;
  let fracPart: string;

  if (lastComma >= 0 && lastDot >= 0) {
    // İkisi de var: sonda gelen ondalık ayraçtır.
    const sep = Math.max(lastComma, lastDot);
    intPart = s.slice(0, sep).replace(/[.,]/g, '');
    fracPart = s.slice(sep + 1);
  } else if (lastComma >= 0) {
    intPart = s.slice(0, lastComma).replace(/,/g, '');
    fracPart = s.slice(lastComma + 1);
  } else if (lastDot >= 0) {
    const after = s.slice(lastDot + 1);
    // Son grup tam üç haneliyse nokta binlik ayraçtır.
    if (after.length === 3 && lastDot > 0) {
      intPart = s.replace(/\./g, '');
      fracPart = '';
    } else {
      intPart = s.slice(0, lastDot).replace(/\./g, '');
      fracPart = after;
    }
  } else {
    intPart = s;
    fracPart = '';
  }

  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) return null;
  if (intPart === '' && fracPart === '') return null;

  const whole = intPart === '' ? 0 : Number(intPart);
  let cents = fracPart === '' ? 0 : Number((fracPart + '00').slice(0, 2));

  // Üçüncü ondalık haneden yukarı yuvarla.
  if (fracPart.length > 2 && Number(fracPart[2]) >= 5) cents += 1;

  const total = whole * KURUS_PER_LIRA + cents;
  if (!Number.isSafeInteger(total)) return null;

  return ((negative ? -total : total) as Kurus);
}

/** Oran girdisini baz puana çevirir: "25", "25,5", "%25,5" → 2500 / 2550 */
export function parseRate(input: string): BasisPoints | null {
  if (typeof input !== 'string') return null;
  const cleaned = input.trim().replace(/[%\s]/g, '');
  if (!cleaned) return null;
  const parsed = parseAmount(cleaned);
  if (parsed === null) return null;
  // parseAmount yüzdeyi "kuruş" gibi okur; 25,5 → 2550 zaten baz puandır.
  if (parsed < 0 || parsed > BPS_PER_UNIT) return null;
  return parsed as unknown as BasisPoints;
}
