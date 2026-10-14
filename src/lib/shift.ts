/**
 * Vardiya süresi, tazeliği ve türetilmiş oranları.
 *
 * Veritabanı bilmez — vardiyanın alanlarını alır, sayı üretir.
 *
 * TASARIM KARARI — vardiya BAŞLARKEN hiçbir şey sorulmaz, tek tuş. Mesafe
 * ve süre vardiya BİTERKEN sürücünün ağzından alınır. Sürücü işe başlarken
 * telefonla uğraşmaz; akşam hesabı kapatırken uğraşır.
 */

import { type Kurus, asKurus, roundHalfAwayFromZero } from './money.ts';

/** Milisaniye cinsinden unix damgası — `syncColumns.createdAt` ile aynı tip. */
export type UnixMs = number;

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

/**
 * Bu süreden uzun süre açık kalan vardiya "unutulmuş" sayılır.
 *
 * 16 saat seçildi: gerçek bir vardiya bunu nadiren aşar, ama sürücü
 * bitirmeyi unuttuysa ertesi sabaha kadar bu eşiği mutlaka geçer.
 *
 * Unutulan vardiya SESSİZCE KAPATILMAZ — kapatırsak bitiş saatini biz
 * uydurmuş oluruz. Kullanıcıya sorulur; sürücü zaten vardiya sonunda
 * çalıştığı süreyi kendisi yazıyor, mesele orada kapanır.
 */
export const STALE_SHIFT_HOURS = 16;

export interface ShiftTiming {
  startedAt: UnixMs;
  /** Boşsa vardiya açıktır. */
  endedAt: UnixMs | null;
  /** Sürücünün yazdığı fiilî süre. Damgalardan çıkan farkı EZER. */
  workedMinutes: number | null;
  /** Sürücünün yazdığı, vardiya boyunca kat edilen yol. */
  distanceKm: number | null;
}

export interface ShiftDuration {
  minutes: number;
  /**
   * Sürenin damgalardan mı türetildiği. Sürücü kendi yazdıysa `false`.
   *
   * Arayüz bunu göstermek zorunda değil ama TL/saat gibi türetilmiş
   * sayıların ne kadar güvenilir olduğunu belirleyen şey budur:
   * mola verilen ve unutulan vardiyalarda damga farkı gerçeği aşar.
   */
  isEstimated: boolean;
}

/**
 * Vardiyanın süresi.
 *
 * Öncelik sırası:
 * 1. Sürücünün vardiya sonunda yazdığı `workedMinutes` — mola düşülmüş, gerçek
 * 2. `endedAt − startedAt` — soruyu boş geçtiyse kapalı vardiyanın damga farkı
 *
 * AÇIK VARDİYANIN SÜRESİ YOK (sıfır). Çalışılan saat vardiya bitince
 * soruluyor; açıkken işleyen bir sayaç sürücünün istemediği bir mantık:
 * mola, bekleme ve özel işler sayaca giriyor, ekrandaki süre gerçeği
 * söylemiyordu. Açık vardiya saat başına oranlara da girmez.
 */
export function resolveShiftDuration(
  shift: ShiftTiming, _now?: UnixMs,
): ShiftDuration {
  const entered = shift.workedMinutes;
  if (entered != null && Number.isFinite(entered) && entered > 0) {
    return { minutes: Math.floor(entered), isEstimated: false };
  }

  if (shift.endedAt == null) return { minutes: 0, isEstimated: true };

  const span = shift.endedAt - shift.startedAt;
  if (!Number.isFinite(span) || span <= 0) {
    return { minutes: 0, isEstimated: true };
  }

  return { minutes: Math.floor(span / MS_PER_MINUTE), isEstimated: true };
}

/** Vardiya şu an açık mı? */
export function isShiftOpen(shift: Pick<ShiftTiming, 'endedAt'>): boolean {
  return shift.endedAt == null;
}

/**
 * Vardiya unutulmuş mu? Açık ve `STALE_SHIFT_HOURS`'ı aşmışsa evet.
 *
 * Kapalı vardiya ne kadar uzun olursa olsun bayat değildir — sürücü
 * onu bilerek kapatmıştır.
 */
export function isShiftStale(
  shift: Pick<ShiftTiming, 'startedAt' | 'endedAt'>,
  now: UnixMs,
  thresholdHours: number = STALE_SHIFT_HOURS,
): boolean {
  if (shift.endedAt != null) return false;
  const elapsedHours = (now - shift.startedAt) / (MS_PER_MINUTE * MINUTES_PER_HOUR);
  return elapsedHours > thresholdHours;
}

// ---------------------------------------------------------------------------
// Türetilmiş oranlar
// ---------------------------------------------------------------------------

/**
 * Saat başına kazanç, kuruş.
 *
 * Süre yoksa `null` döner — SIFIR DEĞİL. Sıfır "saatte hiç kazanmadı"
 * demektir; bilinmeyen ise gösterilmemesi gereken şeydir.
 */
export function earningsPerHour(
  amount: Kurus, minutes: number | null,
): Kurus | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null;
  return asKurus(roundHalfAwayFromZero(amount / (minutes / MINUTES_PER_HOUR)));
}

/** Kilometre başına kazanç, kuruş. Kilometre yoksa `null`. */
export function earningsPerKm(
  amount: Kurus, distanceKm: number | null,
): Kurus | null {
  if (distanceKm == null || !Number.isFinite(distanceKm) || distanceKm <= 0) {
    return null;
  }
  return asKurus(roundHalfAwayFromZero(amount / distanceKm));
}

/**
 * ÇALIŞILAN gün başına ortalama, kuruş. Gün yoksa `null`.
 *
 * Payda çalışılan gün sayısıdır, takvim günü değil: sürücü çalışmadığı
 * Pazar'ı "0 ₺ kazandığı gün" olarak saymaz ve haklıdır.
 */
export function earningsPerDay(
  amount: Kurus, dayCount: number,
): Kurus | null {
  if (!Number.isFinite(dayCount) || dayCount <= 0) return null;
  return asKurus(roundHalfAwayFromZero(amount / dayCount));
}

/** Sefer başına ortalama, kuruş. Sefer yoksa `null`. */
export function earningsPerRide(
  amount: Kurus, rideCount: number,
): Kurus | null {
  if (!Number.isFinite(rideCount) || rideCount <= 0) return null;
  return asKurus(roundHalfAwayFromZero(amount / rideCount));
}

// ---------------------------------------------------------------------------
// Vardiya özeti
// ---------------------------------------------------------------------------

export interface ShiftStats {
  durationMinutes: number;
  isDurationEstimated: boolean;
  distanceKm: number | null;
  rideCount: number;
  perHour: Kurus | null;
  perKm: Kurus | null;
  perRide: Kurus | null;
}

/**
 * Vardiyanın türetilmiş sayıları.
 *
 * `amount` olarak hangi kâr satırının verileceği ÇAĞIRANIN kararıdır —
 * "cebe kalan / saat" ile "ciro / saat" farklı sorulardır ve bu modül
 * hangisinin doğru olduğunu bilemez.
 */
export function calculateShiftStats(
  shift: ShiftTiming, amount: Kurus, rideCount: number, now: UnixMs,
): ShiftStats {
  const duration = resolveShiftDuration(shift, now);
  const km = normalizeDistance(shift.distanceKm);

  return {
    durationMinutes: duration.minutes,
    isDurationEstimated: duration.isEstimated,
    distanceKm: km,
    rideCount,
    perHour: earningsPerHour(amount, duration.minutes),
    perKm: earningsPerKm(amount, km),
    perRide: earningsPerRide(amount, rideCount),
  };
}

/** Bozuk kilometre girdisini `null`'a düşürür — sıfıra değil. */
export function normalizeDistance(distanceKm: number | null | undefined): number | null {
  if (distanceKm == null) return null;
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return null;
  return distanceKm;
}

/** Yıpranma payı hesaplanabilir mi? Arayüz eksik veriyi söylemek zorunda. */
export function canCalculateWear(shift: Pick<ShiftTiming, 'distanceKm'>): boolean {
  return normalizeDistance(shift.distanceKm) != null;
}

/**
 * Süreyi okunur yazar: 370 → "6 sa 10 dk", 45 → "45 dk", 120 → "2 sa".
 * Negatif ya da bozuk süre "0 dk" — kart çökmesin.
 */
export function formatDuration(minutes: number): string {
  const m = Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 0;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} dk`;
  return rest === 0 ? `${h} sa` : `${h} sa ${rest} dk`;
}
