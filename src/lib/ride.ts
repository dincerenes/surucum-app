/**
 * Sefer tutarlarının hesabı.
 *
 * Bu modül veritabanı bilmez — girdi alır, tutar üretir. Sebebi test:
 * komisyon aritmetiği native SQLite kurmadan doğrulanabilmeli.
 *
 * TASARIM KARARI — brüt, komisyon ve net ÜÇÜ DE saklanır, ikisi
 * diğerinden türetilmez. Kullanıcı bir kazanç kaynağının komisyon oranını
 * sonradan değiştirdiğinde geçmiş seferlerin tutarı DEĞİŞMEMELİ. Oranın
 * anlık kopyası da saklanır ki kayıt kendi kendini açıklasın.
 */

import {
  type BasisPoints, type Kurus, BPS_PER_UNIT, ZERO,
  applyRate, clampBps, roundHalfAwayFromZero, subtract,
} from './money.ts';

export interface RideAmountsInput {
  /** Sürücünün girdiği tutar — taksimetre ya da uygulamanın yazdığı brüt. */
  grossAmountKurus: Kurus;

  /** Kazanç kaynağının O ANDAKİ komisyon oranı. */
  commissionBps: BasisPoints;

  /**
   * Sürücü kesintiyi rakam olarak biliyorsa ("2.400 kesmiş, 1.800 yatırmış")
   * oran yerine bu kullanılır. Oran yine de kayda yazılır ama bu tutardan
   * geriye hesaplanır — kayıt denetlenebilir kalsın diye.
   */
  commissionOverrideKurus?: Kurus;

  /** Bahşiş komisyona TABİ DEĞİLDİR; net hesabına da girmez, ayrı durur. */
  tipKurus?: Kurus;
}

export interface RideAmounts {
  grossAmountKurus: Kurus;
  commissionKurus: Kurus;
  netAmountKurus: Kurus;
  commissionBps: BasisPoints;
  tipKurus: Kurus;
}

/**
 * Sefer tutarlarını hesaplar.
 *
 * `net = brüt − komisyon`. Bahşiş buna DAHİL DEĞİLDİR: `profit.ts` bahşişi
 * ciro seviyesinde ayrıca topluyor, net'e de eklersek iki kez sayılır.
 */
export function calculateRideAmounts(input: RideAmountsInput): RideAmounts {
  const gross = input.grossAmountKurus;

  if (!Number.isInteger(gross) || gross < 0) {
    throw new RangeError(`Sefer tutarı negatif olamaz: ${gross}`);
  }

  const tip = input.tipKurus ?? ZERO;
  if (!Number.isInteger(tip) || tip < 0) {
    throw new RangeError(`Bahşiş negatif olamaz: ${tip}`);
  }

  const commission = resolveCommission(gross, input);
  const net = subtract(gross, commission);

  return {
    grossAmountKurus: gross,
    commissionKurus: commission,
    netAmountKurus: net,
    commissionBps: effectiveBps(gross, commission, input),
    tipKurus: tip,
  };
}

/**
 * Komisyon tutarı. Sürücünün girdiği kesinti varsa o, yoksa orandan hesap.
 *
 * Kesinti brütü AŞAMAZ — aşarsa brüte kırpılır. Sebebi: negatif net,
 * raporda "bu sefer bana para kaybettirdi" gibi okunur ve o veri yanlıştır;
 * sürücü büyük ihtimalle rakamı yanlış yazmıştır.
 */
function resolveCommission(gross: Kurus, input: RideAmountsInput): Kurus {
  const override = input.commissionOverrideKurus;

  if (override !== undefined) {
    if (!Number.isInteger(override) || override < 0) {
      throw new RangeError(`Komisyon negatif olamaz: ${override}`);
    }
    return (override > gross ? gross : override) as Kurus;
  }

  if (input.commissionBps <= 0) return ZERO;
  return applyRate(gross, input.commissionBps);
}

/**
 * Kayda yazılacak oran.
 *
 * Oran verilmişse aynen saklanır. Kesinti rakam olarak girilmişse oran
 * geriye hesaplanır — BİLGİ AMAÇLIDIR, hesaba tekrar girmez. Yuvarlama
 * yüzünden bu orandan brüte dönüldüğünde kuruş sapabilir; gerçek olan
 * saklanan üç tutardır, oran yalnızca kaydın açıklamasıdır.
 */
function effectiveBps(
  gross: Kurus, commission: Kurus, input: RideAmountsInput,
): BasisPoints {
  if (input.commissionOverrideKurus === undefined) {
    return clampBps(input.commissionBps);
  }
  if (gross === 0) return clampBps(0);
  return clampBps((commission / gross) * BPS_PER_UNIT);
}
