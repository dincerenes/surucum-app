/**
 * Kâr hesabı.
 *
 * Bir sürücünün gününü ÜÇ ayrı sayı anlatır ve üçü de gösterilir:
 *
 *   1. CİRO          — müşteriden tahsil edilen brüt tutar.
 *   2. CEBE KALAN    — ciro eksi komisyon, eksi yakıt, eksi o gün ödenen
 *                      gider. Yıpranma hariç.
 *   3. GERÇEK KÂR    — cebe kalan, eksi kilometre yıpranma payı.
 *
 * Neden üçü birden? Çünkü 2 ile 3 arasındaki fark ürünün varlık sebebi.
 * Sürücü akşam 3.000 lira ile eve gider ve kazandığını sanır; oysa plaka
 * kirasının o güne düşen payı ve aracın erimesi hesaba katılınca gerçek
 * rakam çok daha düşüktür. Yalnızca (3)'ü göstermek sürücüyü sayıya
 * inandırmaz — "ben 3.000 lira aldım, bu uygulama ne diyor" der ve siler.
 * Yalnızca (2)'yi göstermek ise bildiğini tekrar etmektir.
 *
 * İKİ SATIR ARASINDAKİ TEK FARK YIPRANMA. Komisyon, yakıt ve gider
 * ikisinde de aynı sayı; ekrandaki satırlar toplanınca gerçek kâra
 * ulaşmalı.
 *
 * (2) "GERÇEKLEŞMİŞ NAKİT" DEĞİLDİR ve öyle anlatılmamalı: yakıt,
 * "Yakıt tek sayıdır" kuralıyla vardiya başına bulunuyor — tüketim
 * girildiyse km × tüketim × fiyat (bir model), girilmediyse o vardiyanın
 * dolumu. O gün pompaya ödenenle aynı olmayabilir; arayüz yakıt satırının
 * kaynağını ve sayılmayan dolumu ayrıca söylüyor (`summary-notes.ts`).
 * (3) yıpranma payını da düşer — bilerek düşük tutulmuş bir katsayı.
 */

import { type Kurus, ZERO, add, multiply, subtract, sum } from './money.ts';

/** Bir dönemin kâr dökümü. Tüm alanlar kuruş. */
export interface ProfitBreakdown {
  /** Brüt hasılat: seferlerin brütü + bahşiş. */
  grossRevenue: Kurus;

  /** Kazanç kaynaklarının kestiği toplam komisyon. */
  commission: Kurus;

  /**
   * O günün yakıt maliyeti — vardiya başına tüketimden ya da dolumdan
   * (`day-summary.ts`). Adı eski; pompaya ödenen tutar olmayabilir.
   */
  fuelPaid: Kurus;

  /** O gün fiilen ödenen diğer giderler — yemek, otopark, yıkama. */
  expensesPaid: Kurus;

  /** Dönemsel sabit giderlerin bu döneme düşen payı. Tahakkuk. */
  fixedShare: Kurus;

  /** Sürülen kilometrenin yıpranma karşılığı. Tahmin. */
  wearShare: Kurus;

  /** (1) Ciro. `grossRevenue` ile aynı; okunurluk için ayrı ad. */
  revenue: Kurus;

  /** (2) Cebe kalan — ciro − komisyon − yakıt − gider. Yıpranma hariç. */
  cashProfit: Kurus;

  /** (3) Gerçek kâr — tahakkuk ve yıpranma düşülmüş. */
  trueProfit: Kurus;

  /** Yıpranma payının kilometresi ölçüldü mü, tahmin mi edildi? */
  isDistanceEstimated: boolean;
}

export interface ProfitInput {
  /** Seferlerin brüt tutarları. */
  grossAmounts: readonly Kurus[];
  /** Seferlerin komisyon tutarları. */
  commissionAmounts: readonly Kurus[];
  /** Bahşişler. Komisyona tabi değildir, doğrudan ciroya eklenir. */
  tips?: readonly Kurus[];

  /** Dönemin yakıt tutarları. */
  fuelAmounts?: readonly Kurus[];
  /** Dönemde ödenen diğer gider tutarları. */
  expenseAmounts?: readonly Kurus[];

  /** Sabit giderlerin bu döneme düşen payı — çağıran taraf hesaplar. */
  fixedShare?: Kurus;

  /** Sürülen kilometre. */
  distanceKm?: number;
  /** Aracın kilometre başına yıpranma payı, kuruş. */
  wearPerKmKurus?: Kurus;
  /** Kilometre sayaçtan mı okundu, yoksa tahmin mi edildi? */
  isDistanceEstimated?: boolean;

  /**
   * Yıpranma payı hazır hesaplanmışsa. Verilirse `distanceKm` ve
   * `wearPerKmKurus` KULLANILMAZ.
   *
   * Sebebi çok araçlı gün: aynı iş gününde iki farklı araçla çalışan
   * sürücünün her aracı farklı yıpranma oranı taşır. Tek bir orana
   * indirgemek için ortalama almak gerekirdi ve ortalama, kuruş
   * seviyesinde yanlış sonuç verir. Çağıran taraf her vardiyanın payını
   * kendi oranıyla hesaplayıp toplamını buraya verir.
   */
  wearShare?: Kurus;
}

/**
 * Dönemin kâr dökümünü hesaplar.
 *
 * Tüm aritmetik `money.ts` üzerinden yapılır; burada çıplak `+` yoktur.
 */
export function calculateProfit(input: ProfitInput): ProfitBreakdown {
  const grossRides = sum(input.grossAmounts);
  const tips = sum(input.tips ?? []);
  const grossRevenue = add(grossRides, tips);

  const commission = sum(input.commissionAmounts);
  const fuelPaid = sum(input.fuelAmounts ?? []);
  const expensesPaid = sum(input.expenseAmounts ?? []);
  const fixedShare = input.fixedShare ?? ZERO;
  const wearShare = input.wearShare
    ?? calculateWearShare(input.distanceKm, input.wearPerKmKurus);

  // (2) Yıpranma hariç: komisyon, yakıt ve gider düşülmüş.
  const cashProfit = subtract(grossRevenue, add(commission, fuelPaid, expensesPaid));

  // (3) Aynı hesap, üstüne yıpranma payı. Tek fark bu.
  const trueProfit = subtract(cashProfit, add(fixedShare, wearShare));

  return {
    grossRevenue,
    commission,
    fuelPaid,
    expensesPaid,
    fixedShare,
    wearShare,
    revenue: grossRevenue,
    cashProfit,
    trueProfit,
    isDistanceEstimated: input.isDistanceEstimated ?? false,
  };
}

/**
 * Kilometre yıpranma payı = km × kilometre başına kuruş.
 *
 * Kilometre bilinmiyorsa SIFIR döner — uydurulmuş bir sayı, eksik bir
 * sayıdan kötüdür. Kilometrenin tahmin olduğu durumda hesap yine yapılır
 * ama `isDistanceEstimated` ile işaretlenir; arayüz bunu göstermek zorunda.
 */
export function calculateWearShare(
  distanceKm: number | null | undefined,
  wearPerKmKurus: Kurus | null | undefined,
): Kurus {
  if (distanceKm == null || wearPerKmKurus == null) return ZERO;
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return ZERO;
  if (wearPerKmKurus <= 0) return ZERO;
  return multiply(wearPerKmKurus, distanceKm);
}

/*
 * NOT — sabit gider tahakkuku YAYIN SONRASINA ERTELENDİ (27 Ağustos 2026
 * kapsam kararı). v1'de plaka kirası, kasko, MTV güne dağıtılmıyor; sürücü
 * isterse bunları sıradan gider olarak giriyor ve o gün "cebe kalan"dan
 * düşüyor. Gerçek kâr satırı yalnızca km yıpranma payını düşüyor.
 *
 * `fixedShare` alanı DURUYOR ve varsayılanı sıfır — motor geldiğinde
 * çağıran taraf payı hesaplayıp buraya verecek, bu modül değişmeyecek.
 *
 * Motor geldiğinde uyulacak kural: aylık tutarı gün sayısına naif bölmek
 * kuruş kaybettirir ve ayın günleri toplandığında aylık tutar tutmaz.
 * Bölme `money.ts`'teki `allocate()` ile yapılmalı, gün de o dizideki
 * indeksini almalı.
 */
