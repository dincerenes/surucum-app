/**
 * Kâr şelalesi — vardiya sonu ödül anının çizim hesabı.
 *
 * Arayüz bilmez: üç satırın tutarlarını alır, her çubuğun NEREDEN
 * NEREYE uzandığını ve eksenin sınırlarını üretir. Çizim bileşeni
 * (`profit-waterfall.tsx`) yalnızca bu sayıları piksele çeviriyor; hesap
 * burada olduğu için negatif gün ve bilinmeyen yıpranma native ortam
 * kurmadan test edilebiliyor.
 *
 * SIRA ÖZETİN SIRASI (tasarım brief'i, Tur 3): Ciro, Komisyon, Yakıt,
 * Gider, Cebe kalan, Yıpranma, Gerçek kâr. Şelale satırların yanında
 * duran bir RESİM — satırlar başka sırada okunup çubuklar başka sırada
 * akarsa sürücü ikisini eşleştiremez.
 *
 * Satır atlama kuralı `summary-rows.tsx` ile aynı: Ciro ve toplamlar her
 * zaman çizilir, sıfır kesinti çizilmez.
 *
 * BİLİNMEYEN TAHMİN EDİLMEZ. Kilometre girilmediyse yıpranma payı sıfır
 * değil BİLİNMİYOR; o zaman Yıpranma ve Gerçek kâr çubukları hiç
 * çizilmez ve büyük rakam Cebe kalan olur. "Gerçek kâr = cebe kalan"
 * diye bir çubuk çizmek, aracın hiç erimediğini söylemek olurdu.
 */

import { type Kurus, formatInteger, formatKurus } from './money.ts';

export type WaterfallKey =
  | 'revenue' | 'commission' | 'fuel' | 'expenses' | 'cash' | 'wear' | 'true';

/**
 * Çubuğun karakteri — rengini bileşen buradan seçiyor.
 * - `start`: ciro, sıfırdan uzanır
 * - `deduction`: komisyon, yakıt, gider; önceki toplamın bittiği yerden düşer
 * - `wear`: yıpranma; kesinti gibi düşer ama ayrı renkte, çünkü cebinden
 *   çıkan para değil, aracın erimesi
 * - `total`: cebe kalan ve gerçek kâr, sıfırdan uzanır
 */
export type WaterfallKind = 'start' | 'deduction' | 'wear' | 'total';

export interface WaterfallStep {
  key: WaterfallKey;
  /** Yalnızca özetin sözlüğü: Ciro, Komisyon, Yakıt, Gider, Cebe kalan, Yıpranma, Gerçek kâr. */
  label: string;
  kind: WaterfallKind;
  /**
   * Satırın İŞARETLİ etkisi: ciro ve toplamlar kendi değeri, kesintiler
   * eksi. Erişilebilirlik metni bunu okuyor.
   */
  signed: Kurus;
  /** Çubuğun başladığı nokta, kuruş — çubuk buradan büyür. */
  from: number;
  /** Çubuğun bittiği nokta, kuruş. Büyük rakam bu satıra gelince buraya sayar. */
  to: number;
}

export interface WaterfallInput {
  revenue: Kurus;
  commission: Kurus;
  fuel: Kurus;
  expenses: Kurus;
  cashProfit: Kurus;
  wearShare: Kurus;
  trueProfit: Kurus;
  /** Kilometre girildi mi? Girilmediyse yıpranma BİLİNMİYOR, sıfır değil. */
  wearKnown: boolean;
}

export interface WaterfallModel {
  steps: WaterfallStep[];
  /** Eksenin alt sınırı, kuruş. Hiçbir zaman sıfırdan büyük değil. */
  min: number;
  /** Eksenin üst sınırı, kuruş. Hiçbir zaman sıfırdan küçük değil. */
  max: number;
  /** Büyük rakam — yıpranma biliniyorsa Gerçek kâr, bilinmiyorsa Cebe kalan. */
  headline: { label: 'Gerçek kâr' | 'Cebe kalan'; value: Kurus };
}

/** Özetin üç satırından şelaleyi kurar. */
export function buildWaterfall(input: WaterfallInput): WaterfallModel {
  const steps: WaterfallStep[] = [];
  steps.push({
    key: 'revenue', label: 'Ciro', kind: 'start',
    signed: input.revenue, from: 0, to: input.revenue,
  });

  let running: number = input.revenue;
  const deduct = (key: WaterfallKey, label: string, kind: WaterfallKind, amount: Kurus) => {
    // Sıfır kesinti satırlarda da yok — çubuğu da yok.
    if (amount === 0) return;
    steps.push({
      key, label, kind, signed: -amount as Kurus, from: running, to: running - amount,
    });
    running -= amount;
  };

  deduct('commission', 'Komisyon', 'deduction', input.commission);
  deduct('fuel', 'Yakıt', 'deduction', input.fuel);
  deduct('expenses', 'Gider', 'deduction', input.expenses);

  // Toplam çubuğu özetin KENDİ sayısını çiziyor, yürüyen toplamı değil:
  // ekranda iki farklı "cebe kalan" olamaz.
  steps.push({
    key: 'cash', label: 'Cebe kalan', kind: 'total',
    signed: input.cashProfit, from: 0, to: input.cashProfit,
  });

  if (input.wearKnown) {
    running = input.cashProfit;
    deduct('wear', 'Yıpranma', 'wear', input.wearShare);
    steps.push({
      key: 'true', label: 'Gerçek kâr', kind: 'total',
      signed: input.trueProfit, from: 0, to: input.trueProfit,
    });
  }

  let min = 0;
  let max = 0;
  for (const s of steps) {
    min = Math.min(min, s.from, s.to);
    max = Math.max(max, s.from, s.to);
  }

  return {
    steps,
    min,
    max,
    headline: input.wearKnown
      ? { label: 'Gerçek kâr', value: input.trueProfit }
      : { label: 'Cebe kalan', value: input.cashProfit },
  };
}

/**
 * Bir tutarın eksendeki yeri, piksel.
 *
 * Eksen tamamen sıfırsa (cirosu ve gideri olmayan vardiya) bölme sıfıra
 * düşmesin diye her şey sol kenarda durur.
 */
export function positionPx(
  value: number, domain: { min: number; max: number }, width: number,
): number {
  const span = domain.max - domain.min;
  if (span <= 0 || width <= 0) return 0;
  const x = ((value - domain.min) / span) * width;
  return Math.min(width, Math.max(0, x));
}

/**
 * Çubuğun piksel uçları — `start` çubuğun büyümeye başladığı uç.
 *
 * İKİ KURAL:
 * 1. Sıfır olmayan tutar EN AZ `minPx` genişlikte çizilir. 5.000 ₺ ciroda
 *    5 ₺'lik otopark bir pikselin altına düşüp kayboluyordu; satırda
 *    duran kalemin çubuğu da görünmeli.
 * 2. Çubuk izden asla taşmaz. En küçük genişlik kenarda dışarı
 *    taşacaksa çubuk içeri kaydırılır, kırpılmaz.
 */
export function segmentPx(
  step: Pick<WaterfallStep, 'from' | 'to'>,
  domain: { min: number; max: number },
  width: number,
  minPx: number,
): { start: number; end: number } {
  const start = positionPx(step.from, domain, width);
  let end = positionPx(step.to, domain, width);
  if (step.from === step.to || width <= 0) return { start, end: start };

  const dir = step.to > step.from ? 1 : -1;
  const floor = Math.min(minPx, width);
  if (Math.abs(end - start) < floor) end = start + dir * floor;

  // Taşan çubuğu bütünüyle içeri kaydır.
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const shift = lo < 0 ? -lo : hi > width ? width - hi : 0;
  // Kayan nokta artığı (−1e-17 gibi) da kenarı aşmasın.
  const clamp = (x: number) => Math.min(width, Math.max(0, x));
  return { start: clamp(start + shift), end: clamp(end + shift) };
}

/** Sırayla belirme planı. */
export interface RevealPlan {
  /** Her satırın büyümeye başladığı an, ms. */
  delays: number[];
  /** Son çubuğun yerine oturduğu an, ms. */
  end: number;
}

/**
 * Satırların ne zaman büyüyeceği.
 *
 * Bütün dizi `budget` içinde biter: ödül anı sürücüyü bekletmemeli, ama
 * her kesintinin ayrı ayrı "düştüğü" de hissedilmeli. Az satırda aralık
 * `maxGap`'e kadar açılır; yedi satırda bütçeye sığacak kadar daralır ve
 * çubuklar hafifçe üst üste biner.
 */
export function revealPlan(
  count: number,
  { lead = 250, grow = 450, budget = 2500, maxGap = 380 }:
  { lead?: number; grow?: number; budget?: number; maxGap?: number } = {},
): RevealPlan {
  if (count <= 0) return { delays: [], end: 0 };
  const room = Math.max(0, budget - lead - grow);
  const gap = count > 1 ? Math.min(maxGap, room / (count - 1)) : 0;
  const delays = Array.from({ length: count }, (_, i) => Math.round(lead + i * gap));
  return { delays, end: delays[count - 1] + grow };
}

/**
 * Hikâyeyi tek cümlede söyler: "Aracın bu vardiyada 238 km'de 595 ₺ eridi."
 *
 * Kilometre ya da pay yoksa `null` — cümle uydurulmaz. Tutar küsuratsızsa
 * kuruş haneleri yazılmıyor (cümlede "595,00 ₺" kalabalık); küsurat
 * varsa olduğu gibi yazılıyor, yuvarlanmıyor — satırdaki sayıyla aynı
 * olmalı.
 */
export function wearSentence(distanceKm: number | null, wearShare: Kurus): string | null {
  if (distanceKm == null || !Number.isFinite(distanceKm) || distanceKm <= 0) return null;
  if (wearShare <= 0) return null;
  const amount = formatKurus(wearShare, { decimals: wearShare % 100 !== 0 });
  return `Aracın bu vardiyada ${formatInteger(distanceKm)} km'de ${amount} eridi.`;
}

/**
 * Ekran okuyucu metni — görseldeki her çubuk, işaretiyle.
 *
 * Şelale görsel bir hikâye; görmeyen sürücü aynı hikâyeyi sırayla
 * duymalı. Büyük rakam başa konuyor, çünkü gören sürücü de önce onu görüyor.
 */
export function waterfallA11yLabel(model: WaterfallModel): string {
  const head = `${model.headline.label} ${formatKurus(model.headline.value)}`;
  const rows = model.steps.map((s) => `${s.label} ${formatKurus(s.signed)}`);
  return [head, ...rows].join(', ');
}
