/**
 * "Normal vardiyan" — açık vardiyanın cirosu, sürücünün KENDİ tipik
 * vardiyasının cirosuna göre nerede.
 *
 * NEDEN HEDEF DEĞİL: günlük hedef CEBE KALAN üzerinden ölçülüyor
 * (`goal.ts`). Vardiya sürerken cebe kalan bilinmiyor — komisyon ve yakıt
 * vardiya sonunda soruluyor — ve bilinmeyen bir kesintiyi düşülmüş gibi
 * göstermek sayıya olan güveni bitirir. Ciroyu cebe kalan hedefine bölmek
 * de yanlış: sürücü hedefini tutturduğunu sanıp eve döner.
 *
 * Burada iki taraf da CİRO: bu vardiyanın cirosu ve geçmiş vardiyaların
 * cirosu. Karşılaştırma dürüst, tahmin yok.
 *
 * NORMAL VARDİYA NASIL BULUNUYOR
 * - Açık vardiyanın iş gününden geriye 30 gün (`efficiency.ts` ile aynı
 *   pencere), o gün dahil.
 * - Yalnızca KAPANMIŞ ve en az bir yolcusu olan vardiyalar. Yolcusuz
 *   vardiya (yanlışlıkla açılıp kapatılan) "normal"i sıfıra çekerdi.
 * - Ortalama değil ORTANCA — verimlilik puanıyla aynı gerekçe: tek bir
 *   bayram vardiyası ya da yarım kalmış bir vardiya "normal"i kaydırmasın.
 * - En az 3 vardiya. Daha azıyla "normal" bir iki vardiyanın tesadüfü;
 *   o zaman halka hiç çizilmez. Bekleme yazısı da YOK (sürücünün kararı):
 *   ekran bugünkü hâliyle, yalnızca büyük sayıyla görünür.
 *
 * Veritabanı bilmez; vardiya cirolarını alır.
 */

import { type BusinessDate, addDays } from './business-date.ts';
import { median } from './efficiency.ts';
import { type Kurus, formatKurus } from './money.ts';

/** Normal vardiyanın geriye baktığı gün sayısı. */
export const PACE_WINDOW_DAYS = 30;

/** "Normal" diyebilmek için gereken en az kapanmış vardiya. */
export const PACE_MIN_SHIFTS = 3;

/** Kapanmış bir vardiyanın iş günü ve cirosu. */
export interface ShiftGross {
  date: BusinessDate;
  gross: Kurus;
}

/** Pencerenin ilk günü — repo sorgusu da buradan okuyor, iki yerde sayı yok. */
export function paceWindowStart(date: BusinessDate): BusinessDate {
  return addDays(date, -PACE_WINDOW_DAYS);
}

/**
 * Sürücünün normal vardiyasının cirosu: penceredeki vardiyaların ortancası,
 * tam kuruşa yuvarlanmış. Yeterli vardiya yoksa `null`.
 *
 * `date` açık vardiyanın iş günü. Aynı gün daha önce kapanmış vardiya
 * pencereye giriyor — o da bu vardiyadan önceki bir vardiya.
 */
export function paceBaseline(
  shifts: readonly ShiftGross[], date: BusinessDate,
): Kurus | null {
  const from = paceWindowStart(date);
  const grosses = shifts
    .filter((s) => s.date >= from && s.date <= date && s.gross > 0)
    .map((s) => s.gross);
  if (grosses.length < PACE_MIN_SHIFTS) return null;
  const mid = median(grosses);
  return mid != null && mid > 0 ? Math.round(mid) as Kurus : null;
}

export interface Pace {
  /** Normal vardiyanın cirosu. */
  baseline: Kurus;
  /** Bu vardiyanın cirosu / normal. Tavanı yok. */
  ratio: number;
  /** Halkanın dolgusu, 0–1. */
  progress: number;
  /** Normal vardiyaya ulaşıldı mı? */
  reached: boolean;
}

/** Bu vardiyanın normaline göre yeri. Ölçü yoksa `null` — halka çizilmez. */
export function shiftPace(gross: Kurus, baseline: Kurus | null): Pace | null {
  if (baseline == null || baseline <= 0) return null;
  const ratio = Math.max(0, gross) / baseline;
  return { baseline, ratio, progress: Math.min(1, ratio), reached: ratio >= 1 };
}

/**
 * Halkanın içindeki yüzde: "%58".
 *
 * AŞAĞI yuvarlanıyor: normalin %99,6'sındaki sürücüye "%100" yazıp
 * halkayı yeşile çevirmeden tamam demeyelim. Küçük pay kayan noktanın
 * 0,58 × 100 = 57,999… hatası için: tam %58'deki sürücü %57 görmesin.
 */
export function pacePercent(pace: Pace): string {
  return `%${Math.floor(pace.ratio * 100 + 1e-9)}`;
}

/** Büyük sayının altındaki kısa açıklama. */
export function paceCaption(pace: Pace): string {
  if (pace.ratio > 1) return 'normal vardiyanı geçtin';
  if (pace.reached) return 'normal vardiyana ulaştın';
  return `normal vardiyan ${formatKurus(pace.baseline, { decimals: false })}`;
}
