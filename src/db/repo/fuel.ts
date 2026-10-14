/**
 * Yakıt dolumu.
 *
 * `isFullTank` işaretli iki kayıt arasındaki kilometre ve hacim, aracın
 * GERÇEK tüketimini verir (tam depo yöntemi). Bu yüzden dolum ekranı
 * kilometre sayacını sorar: sürücü zaten pompanın başında, göstergeye
 * bakıyor. Vardiya akışı sayaç sormuyor, burası soruyor.
 */

import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { getDb } from '../client';
import { fuelLogs, vehicleFuelTypes, vehicles } from '../schema';
import { listVehicleFuelTypes } from './vehicles';
import type { FuelLog } from '../schema/fuel';
import type { FuelType } from '../schema/_shared';
import {
  type UnixMs, alive, assertOwned, ownedById, softDeleteRow, stampNew, updateOwned, withOutbox,
} from './_base';
import { getCutoffHour } from './settings';
import { resolveShiftContext } from './shift-context';
import type { Kurus } from '@/lib/money';
import { type BusinessDate, toBusinessDate } from '@/lib/business-date';
import { toWholePositive } from '@/lib/whole-number';
import { isKnownUnitPrice, pickPrimaryFuelType } from '@/lib/fuel-type-pick';

export interface NewFuelLogInput {
  /** Vardiya verildiyse YOK SAYILIR — araç vardiyadan gelir. */
  vehicleId: string;
  fuelType: FuelType;

  /**
   * Açık vardiya varsa kimliği. Dolum vardiyanın GÜNÜNÜ ve ARACINI alır:
   * vardiya ortasında Araçlarım'dan başka araç seçilse bile yakıt,
   * vardiyanın açıldığı araca yazılır.
   */
  shiftId?: string | null;

  /** Sıvı/gaz yakıtta MİLİLİTRE, elektrikte WATT-SAAT. Tam sayı. */
  volumePer1000: number;

  /** Birim başına kuruş: litre, kg veya kWh. */
  unitPriceKurus: Kurus;
  totalAmountKurus: Kurus;

  /** Gerçek tüketim hesabının şartı. */
  isFullTank?: boolean;

  odometerKm?: number | null;
  /** Kullanıcının yazdığı istasyon adı — bu onun kendi verisi. */
  stationName?: string | null;
  receiptPath?: string | null;
  notes?: string | null;
  occurredAt?: UnixMs;

  /**
   * İş günü. Açık vardiya varsa ÇAĞIRAN vardiyanın gününü verir; yoksa
   * kaydın saatinden türetilir. Gece vardiyası gün ortasında dönmesin.
   */
  businessDate?: BusinessDate;
}

/**
 * Dolum kaydeder ve aracın son bilinen birim fiyatını günceller.
 *
 * Son fiyat çevrimdışıyken tahmini maliyet için lazım — yakıt fiyatı
 * kaynağı henüz seçilmedi ve sürücünün kendi son dolumu, dışarıdan
 * gelen herhangi bir fiyattan daha doğru.
 */
export function addFuelLog(
  userId: string,
  input: NewFuelLogInput,
  cutoffHour?: number,
  now: UnixMs = Date.now(),
): FuelLog {
  const occurredAt = input.occurredAt ?? now;
  const cutoff = cutoffHour ?? getCutoffHour(userId);

  // Vardiya ve araç BU HESABIN olmalı — yabancı aracın fiyatı da güncellenirdi.
  const shift = input.shiftId ? resolveShiftContext(userId, input.shiftId) : null;
  const vehicleId = shift ? shift.vehicleId : input.vehicleId;
  if (!shift) assertOwned(vehicles, 'vehicles', userId, vehicleId);

  const stamp = stampNew(userId, now);
  const row = withOutbox('fuel_logs', stamp.id, 'upsert', (tx) => (
    tx.insert(fuelLogs).values({
      ...stamp,
      vehicleId,
      shiftId: shift ? input.shiftId : null,
      fuelType: input.fuelType,
      occurredAt,
      businessDate: shift?.businessDate
        ?? input.businessDate ?? toBusinessDate(occurredAt, cutoff),
      volumePer1000: Math.round(input.volumePer1000),
      unitPriceKurus: input.unitPriceKurus,
      totalAmountKurus: input.totalAmountKurus,
      // Sayaç bulutta integer — ondalık gelirse yuvarlanır.
      odometerKm: toWholePositive(input.odometerKm),
      isFullTank: input.isFullTank ?? true,
      stationName: input.stationName?.trim() || null,
      receiptPath: input.receiptPath ?? null,
      notes: input.notes?.trim() || null,
    }).returning().get()
  ), now);

  rememberUnitPrice(userId, vehicleId, input.fuelType, input.unitPriceKurus, now);
  return row;
}

/**
 * Dolumu düzeltir. Araç ve yakıt tipi bu yoldan DEĞİŞMİYOR — yalnızca
 * tutarlar, sayaç ve notlar.
 */
export function updateFuelLog(
  userId: string, id: string,
  patch: Omit<Partial<NewFuelLogInput>, 'vehicleId' | 'fuelType' | 'shiftId'>,
  now: UnixMs = Date.now(),
): boolean {
  return updateOwned(fuelLogs, 'fuel_logs', userId, id, {
    ...(patch.volumePer1000 !== undefined
      ? { volumePer1000: Math.round(patch.volumePer1000) } : {}),
    ...(patch.unitPriceKurus !== undefined
      ? { unitPriceKurus: patch.unitPriceKurus } : {}),
    ...(patch.totalAmountKurus !== undefined
      ? { totalAmountKurus: patch.totalAmountKurus } : {}),
    ...(patch.odometerKm !== undefined ? { odometerKm: toWholePositive(patch.odometerKm) } : {}),
    ...(patch.isFullTank !== undefined ? { isFullTank: patch.isFullTank } : {}),
    ...(patch.stationName !== undefined
      ? { stationName: patch.stationName?.trim() || null } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes?.trim() || null } : {}),
  }, now);
}

export function deleteFuelLog(userId: string, id: string, now: UnixMs = Date.now()): boolean {
  return softDeleteRow(fuelLogs, 'fuel_logs', userId, id, now);
}

// ---------------------------------------------------------------------------
// Okuma
// ---------------------------------------------------------------------------

export function getFuelLog(userId: string, id: string): FuelLog | undefined {
  return getDb().select().from(fuelLogs).where(ownedById(fuelLogs, userId, id)).get();
}

export function listFuelLogsOnDate(userId: string, date: BusinessDate): FuelLog[] {
  return getDb().select().from(fuelLogs)
    .where(and(alive(fuelLogs, userId), eq(fuelLogs.businessDate, date)))
    .orderBy(desc(fuelLogs.occurredAt))
    .all();
}

export function listFuelLogsInRange(
  userId: string, from: BusinessDate, to: BusinessDate,
): FuelLog[] {
  return getDb().select().from(fuelLogs)
    .where(and(
      alive(fuelLogs, userId),
      gte(fuelLogs.businessDate, from),
      lte(fuelLogs.businessDate, to),
    ))
    .orderBy(desc(fuelLogs.occurredAt))
    .all();
}

/**
 * Bir vardiyaya bağlı dolumlar. Tüketimi hesaplanamayan vardiyanın
 * yakıtı bunlardır (bkz. `day-summary.ts`).
 */
export function listFuelLogsInShift(userId: string, shiftId: string): FuelLog[] {
  return getDb().select().from(fuelLogs)
    .where(and(alive(fuelLogs, userId), eq(fuelLogs.shiftId, shiftId)))
    .orderBy(desc(fuelLogs.occurredAt))
    .all();
}

/** Aracın dolumları, yeniden eskiye. Tüketim hesabının girdisi. */
export function listFuelLogsForVehicle(userId: string, vehicleId: string): FuelLog[] {
  return getDb().select().from(fuelLogs)
    .where(and(alive(fuelLogs, userId), eq(fuelLogs.vehicleId, vehicleId)))
    .orderBy(desc(fuelLogs.occurredAt))
    .all();
}

/**
 * Aracın yakıt tipi satırına son bilinen birim fiyatı yazar.
 *
 * Satır yoksa hiçbir şey yapmaz: araç o yakıtı kullanmıyor olarak
 * tanımlanmış demektir ve dolum kaydı yine de duruyor — sürücünün
 * girdiği veriyi reddetmiyoruz, sadece tahmine katmıyoruz. Yakıt tipi
 * araçtan çıkarılmışsa (yumuşak silinmiş) satırı da yok sayılır.
 *
 * FİYATSIZ DOLUM FİYATI EZMEZ. Fiyat yakıt ekranında isteğe bağlı ve
 * girilmediğinde dolum satırında 0 duruyor; eskiden o 0 araca yazılıyor,
 * bir önceki doğru fiyat kalıcı olarak kayboluyordu (negatif fiyat da
 * ön dolguya "-40" olarak dönüyordu).
 */
function rememberUnitPrice(
  userId: string, vehicleId: string, fuelType: FuelType, unitPriceKurus: Kurus, now: UnixMs,
): void {
  if (!isKnownUnitPrice(unitPriceKurus)) return;

  const row = listVehicleFuelTypes(userId, vehicleId).find((r) => r.fuelType === fuelType);
  if (!row) return;

  updateOwned(vehicleFuelTypes, 'vehicle_fuel_types', userId, row.id, {
    lastUnitPriceKurus: unitPriceKurus,
  }, now);
}

/**
 * Sürücünün vardiya sonunda yazdığı tüketimi ve fiyatı ARACA hatırlatır.
 *
 * Amaç yalnızca ÖNCEDEN DOLDURMAK: bir dahaki vardiya sonunda alanlar dolu
 * gelsin, sürücü çoğu gün onaylayıp geçsin. Hesap bu değerden değil,
 * vardiyaya kopyalanan değerden yapılıyor — geçmiş günler bugün girilen
 * yeni bir tüketimle kaymasın.
 *
 * `isConsumptionMeasured` FALSE kalıyor: bu değer ölçülmedi, sürücü
 * beyan etti. Arayüz ikisini aynı şekilde göstermemeli.
 */
export function rememberStatedFuelFigures(
  userId: string,
  vehicleId: string,
  consumptionPer100Km: number | null | undefined,
  unitPriceKurus: Kurus | null | undefined,
  now: UnixMs = Date.now(),
): void {
  const hasConsumption = consumptionPer100Km != null
    && Number.isFinite(consumptionPer100Km) && consumptionPer100Km > 0;
  const hasPrice = isKnownUnitPrice(unitPriceKurus);
  if (!hasConsumption && !hasPrice) return;

  /**
   * Birincil yakıt tipine yazılıyor. Çift yakıtlı araçta sürücü hangi
   * yakıtla gittiğini söylemiyor; birincil olan en sık kullandığıdır ve
   * ön dolgu için yeterli. Hesap zaten vardiyadaki kopyadan yapılıyor.
   * Hangi satırın birincil sayıldığı `pickPrimaryFuelType`'ta, tek yerde.
   */
  const row = pickPrimaryFuelType(listVehicleFuelTypes(userId, vehicleId));
  if (!row) return;

  updateOwned(vehicleFuelTypes, 'vehicle_fuel_types', userId, row.id, {
    ...(hasConsumption
      ? {
          avgConsumptionPer100Km: Math.round(consumptionPer100Km),
          isConsumptionMeasured: false,
        }
      : {}),
    ...(hasPrice ? { lastUnitPriceKurus: unitPriceKurus } : {}),
  }, now);
}

/**
 * Vardiya sonu sihirbazının ön dolgusu: son bilinen tüketim ve fiyat.
 *
 * Araçtan çıkarılmış (yumuşak silinmiş) yakıt tipi okunmaz — eskiden
 * birincil sıralamada öne geçip kaldırılmış yakıtın fiyatını getirebiliyordu.
 * Hatırlatma ile AYNI satır okunuyor (`pickPrimaryFuelType`): yazılan
 * değer başka bir satıra gidip ön dolgu boş gelmesin.
 */
export function getKnownFuelFigures(userId: string, vehicleId: string): {
  consumptionPer100Km: number | null;
  unitPriceKurus: Kurus | null;
  isMeasured: boolean;
} {
  const row = pickPrimaryFuelType(listVehicleFuelTypes(userId, vehicleId));

  return {
    consumptionPer100Km: row?.avgConsumptionPer100Km ?? null,
    unitPriceKurus: row?.lastUnitPriceKurus ?? null,
    isMeasured: row?.isConsumptionMeasured ?? false,
  };
}
