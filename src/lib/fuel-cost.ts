/**
 * O günün yakıt maliyeti.
 *
 * Sürücü vardiya sonunda kaç km yaptığını ve aracının ortalama tüketimini
 * yazıyor; birim fiyat son dolumundan biliniyor. Üçü çarpılınca o günün
 * yakıt gideri çıkıyor.
 *
 * Depo ve sayaç takibi YOK — her dolumda kilometre sayacı istemek ve
 * zincirdeki tek eksik kayıtla ölçümü bozmak kapsam dışı bırakıldı.
 */

import { type Kurus, ZERO, asKurus, roundHalfAwayFromZero } from './money.ts';

/** Yüz kilometrede tüketilen mililitre — 7,5 lt/100km → 7500. */
export type ConsumptionPer100Km = number;

/**
 * Yakıt maliyeti, kuruş.
 *
 * Üç girdiden biri bile eksikse SIFIR döner: bilinmeyen maliyeti
 * uydurmaktansa hesaba katmamak yeğdir. Arayüz eksik girdiyi söylemek
 * zorunda, yoksa sürücü kârını olduğundan yüksek görür.
 */
export function calculateFuelCost(
  distanceKm: number | null | undefined,
  consumptionPer100Km: ConsumptionPer100Km | null | undefined,
  unitPriceKurus: Kurus | null | undefined,
): Kurus {
  if (distanceKm == null || consumptionPer100Km == null || unitPriceKurus == null) {
    return ZERO;
  }
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return ZERO;
  if (!Number.isFinite(consumptionPer100Km) || consumptionPer100Km <= 0) return ZERO;
  if (!Number.isFinite(unitPriceKurus) || unitPriceKurus <= 0) return ZERO;

  /**
   * km × (ml/100km) → mililitre; ÷1000 → litre; × kuruş/litre → kuruş.
   * Tek ifadede toplanıyor ki ara adımlarda yuvarlama olmasın.
   */
  return asKurus(roundHalfAwayFromZero(
    (distanceKm * consumptionPer100Km * unitPriceKurus) / 100_000,
  ));
}

/** Yakılan mililitre — arayüzde "17,9 lt" diye göstermek için. */
export function calculateFuelVolume(
  distanceKm: number | null | undefined,
  consumptionPer100Km: ConsumptionPer100Km | null | undefined,
): number | null {
  if (distanceKm == null || consumptionPer100Km == null) return null;
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return null;
  if (!Number.isFinite(consumptionPer100Km) || consumptionPer100Km <= 0) return null;
  return Math.round((distanceKm * consumptionPer100Km) / 100);
}
