/**
 * Araç ve araç yakıt tipleri.
 *
 * Sahiplik biçimi burada İKİ İŞ birden yapıyor: hem sabit gider yapısını
 * belirliyor (kiralık plakada aylık bedel var, kendi aracında yok) hem de
 * kilometre yıpranma payını atıyor. Bu yüzden sihirbazda tek soru,
 * modelde iki sonuç.
 */

import {
  and, asc, count, desc, eq, isNotNull, isNull, ne, or, sql,
} from 'drizzle-orm';
import { getDb } from '../client';
import {
  type FuelType, type OwnershipType, type TransmissionType,
} from '../schema/_shared';
import { shifts, vehicleFuelTypes, vehicles } from '../schema';
import type { Vehicle, VehicleFuelType } from '../schema/vehicles';
import {
  type Tx, type UnixMs, alive, enqueue, ownedById, stampNew, updateOwned,
} from './_base';
import { newId } from '@/lib/id';
import { toWholePositive } from '@/lib/whole-number';
import { resolveActiveVehicle } from '@/lib/vehicle-resolve';
import { type WearInputs, wearFor } from '@/lib/wear';
import type { Kurus } from '@/lib/money';

/**
 * Seçili aracın çözümlemesi `lib/vehicle-resolve.ts`'te — saf ve test
 * ediliyor. Ekranlar onu buradan da bulabilsin diye yeniden dışa açılıyor.
 */
export { resolveActiveVehicle };

export interface NewVehicleInput {
  label: string;
  ownership: OwnershipType;
  /** İlk sıradaki yakıt birincil kabul edilir. */
  fuelTypes: readonly FuelType[];
  plate?: string | null;
  make?: string | null;
  model?: string | null;
  modelYear?: number | null;
  initialOdometerKm?: number | null;
  notes?: string | null;
  transmission?: TransmissionType | null;
  /** Yıpranma girdileri — bkz. `lib/wear.ts`. Boş kalan kalem varsayılandan. */
  maintenanceIntervalKm?: number | null;
  maintenanceCostKurus?: Kurus | null;
  tireIntervalKm?: number | null;
  tireCostKurus?: Kurus | null;
  marketValueKurus?: Kurus | null;
  hasAccidentRecord?: boolean | null;
}

const WEAR_INPUT_KEYS = [
  'maintenanceIntervalKm', 'maintenanceCostKurus', 'tireIntervalKm', 'tireCostKurus',
  'marketValueKurus',
] as const;

/** Bulutta integer/bigint: ondalık ya da negatif gelirse burada düzeltilir. */
interface WearColumns {
  maintenanceIntervalKm: number | null;
  maintenanceCostKurus: Kurus | null;
  tireIntervalKm: number | null;
  tireCostKurus: Kurus | null;
  marketValueKurus: Kurus | null;
}

function wearColumns(input: WearInputs): WearColumns {
  return {
    maintenanceIntervalKm: toWholePositive(input.maintenanceIntervalKm),
    maintenanceCostKurus: toKurusOrNull(input.maintenanceCostKurus),
    tireIntervalKm: toWholePositive(input.tireIntervalKm),
    tireCostKurus: toKurusOrNull(input.tireCostKurus),
    marketValueKurus: toKurusOrNull(input.marketValueKurus),
  };
}

function toKurusOrNull(n: number | null | undefined): Kurus | null {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return null;
  return Math.round(n) as Kurus;
}

/**
 * Araç oluşturur ve yakıt tiplerini aynı işlemde yazar.
 *
 * Yıpranma payı sürücünün bakım, lastik ve araç değeri cevaplarından
 * HESAPLANIR (`lib/wear.ts`); bilinmeyen kalem varsayılandan gelir.
 * Kiralık araçta ve işveren aracında sıfırdır — aracın değer kaybı
 * sürücünün cebinden çıkmıyor, o maliyet zaten kira bedeli olarak
 * sayılıyor. Sıfırlanmazsa aynı maliyet iki kez düşülür.
 */
export function createVehicle(
  userId: string, input: NewVehicleInput, now: UnixMs = Date.now(),
): Vehicle {
  const stamp = stampNew(userId, now);
  const wear = wearColumns(input);

  return getDb().transaction((tx) => {
    const row = tx.insert(vehicles).values({
      ...stamp,
      label: input.label.trim(),
      plate: normalize(input.plate),
      make: normalize(input.make),
      model: normalize(input.model),
      // Yıl ve kilometre bulutta integer — ondalık gelirse burada yuvarlanır.
      modelYear: toWholePositive(input.modelYear),
      ownership: input.ownership,
      initialOdometerKm: toWholePositive(input.initialOdometerKm),
      wearPerKmKurus: wearFor(input.ownership, wear),
      notes: normalize(input.notes),
      transmission: input.transmission ?? null,
      ...wear,
      hasAccidentRecord: input.hasAccidentRecord ?? null,
    }).returning().get();

    enqueue(tx, 'vehicles', stamp.id, 'upsert', now);
    insertFuelTypes(tx, userId, stamp.id, input.fuelTypes, now);
    return row;
  });
}

/** Araca yakıt tipi satırlarını yazar; ilki birincil olur. */
function insertFuelTypes(
  tx: Tx, userId: string, vehicleId: string,
  fuelTypes: readonly FuelType[], now: UnixMs,
): void {
  const unique = [...new Set(fuelTypes)];
  unique.forEach((fuelType, index) => {
    const id = newId();
    tx.insert(vehicleFuelTypes).values({
      id, userId, createdAt: now, updatedAt: now, deletedAt: null,
      vehicleId, fuelType, isPrimary: index === 0,
    }).run();
    enqueue(tx, 'vehicle_fuel_types', id, 'upsert', now);
  });
}

export type VehiclePatch = Partial<Omit<NewVehicleInput, 'fuelTypes'>>;

export interface UpdateVehicleOptions {
  /**
   * Sahiplik değişiyorsa yeni katsayı GEÇMİŞ VARDİYALARA da yazılsın mı?
   *
   * Sürücüye tek soru olarak soruluyor: "yanlış girmiştim" (evet) ile
   * "aracı bugün satın aldım / kiraladım" (hayır) iki ayrı gerçek.
   * Kurulum sahiplik sormuyor ve "kendi aracım" varsayıyor; kiralık
   * aracın sürücüsünün ilk düzeltmesi çoğu zaman bir yanlışın düzeltmesi.
   */
  applyWearToPastShifts?: boolean;
}

/**
 * Aracı günceller.
 *
 * YIPRANMA KATSAYISI YALNIZCA SAHİPLİK YA DA YIPRANMA GİRDİLERİ (bakım,
 * lastik, değer) GERÇEKTEN DEĞİŞİNCE yeniden hesaplanır.
 * Eskiden ekran her kayıtta sahipliği gönderiyor, repo da koşulsuz
 * güncel sabiti yazıyordu: yalnızca adı değiştirilen 300 kuruşluk eski
 * bir aracın katsayısı 250'ye iniyordu. Sütunun var olma sebebi tam
 * tersiydi — varsayılan sabiti değiştirdiğimizde mevcut araçlar kaymasın.
 *
 * Sahiplik değişince geçmiş vardiyalar `applyWearToPastShifts`'e göre:
 * - evet: kopyaları yeni katsayıya güncellenir,
 * - hayır: kopyalar olduğu gibi kalır; kopyası HİÇ olmayan eski
 *   vardiyalar aracın ESKİ katsayısıyla dondurulur, yoksa okuma araca
 *   düştüğü için onlar da sessizce yeni katsayıya geçerdi.
 * Güncellenen her vardiya kuyruğa girer. Hepsi TEK İŞLEMDE.
 */
export function updateVehicle(
  userId: string, id: string, patch: VehiclePatch, now: UnixMs = Date.now(),
  options: UpdateVehicleOptions = {},
): boolean {
  const current = getVehicle(userId, id);
  if (!current) return false;

  const ownershipChanged = patch.ownership !== undefined
    && patch.ownership !== current.ownership;
  const nextOwnership = (ownershipChanged ? patch.ownership : current.ownership) as OwnershipType;

  const nextInputs = wearColumns(Object.fromEntries(WEAR_INPUT_KEYS.map((k) => [
    k, patch[k] !== undefined ? patch[k] : current[k],
  ])) as WearInputs);
  const inputsChanged = WEAR_INPUT_KEYS.some((k) => nextInputs[k] !== current[k]);
  const nextWear = ownershipChanged || inputsChanged
    ? wearFor(nextOwnership, nextInputs)
    : current.wearPerKmKurus;
  const wearChanged = nextWear !== current.wearPerKmKurus;

  return getDb().transaction((tx) => {
    const { changes } = tx.update(vehicles).set({
      ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
      ...(patch.plate !== undefined ? { plate: normalize(patch.plate) } : {}),
      ...(patch.make !== undefined ? { make: normalize(patch.make) } : {}),
      ...(patch.model !== undefined ? { model: normalize(patch.model) } : {}),
      ...(patch.modelYear !== undefined ? { modelYear: toWholePositive(patch.modelYear) } : {}),
      ...(patch.initialOdometerKm !== undefined
        ? { initialOdometerKm: toWholePositive(patch.initialOdometerKm) } : {}),
      ...(patch.notes !== undefined ? { notes: normalize(patch.notes) } : {}),
      ...(patch.transmission !== undefined ? { transmission: patch.transmission } : {}),
      ...(patch.hasAccidentRecord !== undefined
        ? { hasAccidentRecord: patch.hasAccidentRecord } : {}),
      ...(inputsChanged ? nextInputs : {}),
      ...(ownershipChanged ? { ownership: patch.ownership } : {}),
      ...(ownershipChanged || inputsChanged ? { wearPerKmKurus: nextWear } : {}),
      updatedAt: now,
    }).where(ownedById(vehicles, userId, id)).run() as unknown as { changes: number };
    if (changes === 0) return false;
    enqueue(tx, 'vehicles', id, 'upsert', now);

    /**
     * Girdiler değişip katsayı değişmediyse geçmişe dokunacak bir şey yok.
     * Sahiplik değişince eski davranış korunuyor (katsayı aynı olsa da).
     */
    if (!ownershipChanged && !wearChanged) return true;

    const apply = options.applyWearToPastShifts === true;
    const target = apply ? nextWear : current.wearPerKmKurus;
    const affected = tx.select({ id: shifts.id }).from(shifts).where(and(
      alive(shifts, userId),
      eq(shifts.vehicleId, id),
      apply
        ? or(isNull(shifts.wearPerKmKurus), ne(shifts.wearPerKmKurus, target))
        : isNull(shifts.wearPerKmKurus),
    )).all();

    for (const s of affected) {
      tx.update(shifts).set({ wearPerKmKurus: target, updatedAt: now })
        .where(ownedById(shifts, userId, s.id)).run();
      enqueue(tx, 'shifts', s.id, 'upsert', now);
    }
    return true;
  });
}

/**
 * Sahiplik `ownership` yapılırsa gerçek kârı DEĞİŞECEK geçmiş vardiya
 * sayısı. Sıfırsa sürücüye soru sorulmaz — cevabı hiçbir şeyi
 * değiştirmeyecek bir soru, sorulmamış olmalı (ör. kendi aracı →
 * kiralık plaka: ikisinde de katsayı aynı).
 */
export function countShiftsAffectedByOwnership(
  userId: string, vehicleId: string, ownership: OwnershipType,
): number {
  const vehicle = getVehicle(userId, vehicleId);
  if (!vehicle || vehicle.ownership === ownership) return 0;

  const next = wearFor(ownership, vehicle);
  return getDb().select({ n: count() }).from(shifts).where(and(
    alive(shifts, userId),
    eq(shifts.vehicleId, vehicleId),
    sql`coalesce(${shifts.wearPerKmKurus}, ${vehicle.wearPerKmKurus}) <> ${next}`,
  )).get()?.n ?? 0;
}

/**
 * Aracın yakıt tiplerini yeniden kurar.
 *
 * Çıkarılan tip YUMUŞAK SİLİNİYOR, satır tablodan kaldırılmıyor: geçmiş
 * dolum kayıtları o tipe bağlı ve sert silme senkronda kaydı diriltir.
 * Kalan tipler korunuyor — yeniden yazsaydık her düzenlemede ölçülmüş
 * tüketim ve son bilinen fiyat sıfırlanırdı.
 *
 * Silinen satırın BİRİNCİL işareti de kalkıyor. Kalmasaydı araçta iki
 * "birincil" olur ve ön dolgu hangisini okuyacağını bilemezdi — eskiden
 * benzinli araçta silinmiş LPG satırının tüketimini getiriyordu.
 *
 * Aynı tip yeniden seçilirse YENİ SATIR AÇILMAZ, silinen satır DİRİLİR:
 * aynı aracın aynı yakıtı için beyan edilen tüketim ve son fiyat hâlâ
 * geçerli ve tabloda yinelenen satır birikmiyor.
 *
 * Hepsi TEK İŞLEMDE: yarıda kalan bir düzenleme aracı yakıtsız ya da
 * birincilsiz bırakmasın.
 *
 * Araç bu hesabın değilse `false` döner ve hiçbir şey yazılmaz.
 */
export function setVehicleFuelTypes(
  userId: string, vehicleId: string, fuelTypes: readonly FuelType[],
  now: UnixMs = Date.now(),
): boolean {
  /**
   * Araç BU HESABIN olmalı. Denetlenmeden önce başka bir hesabın aracına
   * bu hesabın adıyla yakıt satırı açılabiliyordu: sahibi B, aracı A'nın
   * olan bir satır ne A'nın ne B'nin ekranında doğru görünür.
   */
  if (!getVehicle(userId, vehicleId)) return false;

  // Boş liste yok sayılır: araç yakıtsız kalamaz.
  const wanted = [...new Set(fuelTypes)];
  if (wanted.length === 0) return true;

  const current = listVehicleFuelTypes(userId, vehicleId);
  const removed = listRemovedVehicleFuelTypes(userId, vehicleId);

  getDb().transaction((tx) => {
    for (const row of current) {
      if (wanted.includes(row.fuelType)) continue;
      tx.update(vehicleFuelTypes)
        .set({ deletedAt: now, isPrimary: false, updatedAt: now })
        .where(ownedById(vehicleFuelTypes, userId, row.id)).run();
      enqueue(tx, 'vehicle_fuel_types', row.id, 'delete', now);
    }

    wanted.forEach((fuelType, index) => {
      const existing = current.find((r) => r.fuelType === fuelType);
      const primary = index === 0;

      if (existing) {
        if (existing.isPrimary === primary) return;
        tx.update(vehicleFuelTypes)
          .set({ isPrimary: primary, updatedAt: now })
          .where(ownedById(vehicleFuelTypes, userId, existing.id)).run();
        enqueue(tx, 'vehicle_fuel_types', existing.id, 'upsert', now);
        return;
      }

      // Liste en son güncellenen önce geliyor: en taze değerler dirilir.
      const revived = removed.find((r) => r.fuelType === fuelType);
      if (revived) {
        tx.update(vehicleFuelTypes)
          .set({ deletedAt: null, isPrimary: primary, updatedAt: now })
          .where(and(
            eq(vehicleFuelTypes.id, revived.id), eq(vehicleFuelTypes.userId, userId),
          )).run();
        enqueue(tx, 'vehicle_fuel_types', revived.id, 'upsert', now);
        return;
      }

      const id = newId();
      tx.insert(vehicleFuelTypes).values({
        id, userId, createdAt: now, updatedAt: now, deletedAt: null,
        vehicleId, fuelType, isPrimary: primary,
      }).run();
      enqueue(tx, 'vehicle_fuel_types', id, 'upsert', now);
    });
  });
  return true;
}

/**
 * Aracı pasifleştirir — SİLMEZ.
 *
 * Araç silinirse ona bağlı geçmiş vardiya ve yakıt kayıtları sahipsiz
 * kalır ve raporlar bozulur. Sürücü araç değiştirdiğinde eskisi
 * listeden çıkar, geçmişi durur.
 *
 * AÇIK VARDİYANIN ARACI PASİFLEŞTİRİLMEZ — `false` döner, hiçbir şey
 * yazılmaz. Vardiya o araçla sürüyor; araç listeden çıkınca ekranlar
 * başka bir araca düşüyor ve vardiyanın kalan kayıtları o araca
 * yazılıyordu. Önce vardiya bitirilmeli. Ekran bunu önceden sorup
 * açıklıyor (`isVehicleOnOpenShift`); bu denetim son savunma hattı.
 */
export function deactivateVehicle(
  userId: string, id: string, now: UnixMs = Date.now(),
): boolean {
  if (isVehicleOnOpenShift(userId, id)) return false;
  return updateOwned(vehicles, 'vehicles', userId, id, { isActive: false }, now);
}

/** Bu araçla açılmış, henüz bitmemiş bir vardiya var mı? */
export function isVehicleOnOpenShift(userId: string, vehicleId: string): boolean {
  return getDb().select({ id: shifts.id }).from(shifts).where(and(
    alive(shifts, userId), eq(shifts.vehicleId, vehicleId), isNull(shifts.endedAt),
  )).get() != null;
}

export function activateVehicle(
  userId: string, id: string, now: UnixMs = Date.now(),
): boolean {
  return updateOwned(vehicles, 'vehicles', userId, id, { isActive: true }, now);
}

// ---------------------------------------------------------------------------
// Okuma
// ---------------------------------------------------------------------------

export function listVehicles(userId: string): Vehicle[] {
  return getDb().select().from(vehicles)
    .where(alive(vehicles, userId))
    .orderBy(asc(vehicles.sortOrder), asc(vehicles.createdAt))
    .all();
}

export function listActiveVehicles(userId: string): Vehicle[] {
  return listVehicles(userId).filter((v) => v.isActive);
}


export function getVehicle(userId: string, id: string): Vehicle | undefined {
  return getDb().select().from(vehicles).where(ownedById(vehicles, userId, id)).get();
}

/**
 * Aracın yakıt tipleri — BİRİNCİL ÖNCE, sonra eklenme sırası.
 *
 * Sıra `compareFuelTypes` ile aynı ve bilerek: yakıt ekranının varsayılan
 * çipi ve araç düzenlemenin ilk seçili tipi listenin başından geliyor.
 * Eklenme sırasıyla dönerken LPG'ye geçen araçta çip benzinde açılıyor,
 * dolum benzine yazılıyor ve pompada girilen fiyat birincil LPG'ye hiç
 * ulaşmıyordu; düzenleme ekranı da kaydedince birincili sessizce
 * değiştiriyordu.
 */
export function listVehicleFuelTypes(userId: string, vehicleId: string): VehicleFuelType[] {
  return getDb().select().from(vehicleFuelTypes)
    .where(and(alive(vehicleFuelTypes, userId), eq(vehicleFuelTypes.vehicleId, vehicleId)))
    .orderBy(
      desc(vehicleFuelTypes.isPrimary), asc(vehicleFuelTypes.createdAt), asc(vehicleFuelTypes.id),
    )
    .all();
}

/** Araçtan çıkarılmış (yumuşak silinmiş) tipler — yalnızca diriltmek için. */
function listRemovedVehicleFuelTypes(userId: string, vehicleId: string): VehicleFuelType[] {
  return getDb().select().from(vehicleFuelTypes)
    .where(and(
      eq(vehicleFuelTypes.userId, userId),
      eq(vehicleFuelTypes.vehicleId, vehicleId),
      isNotNull(vehicleFuelTypes.deletedAt),
    ))
    .orderBy(desc(vehicleFuelTypes.updatedAt), desc(vehicleFuelTypes.id))
    .all();
}

/** Boş ve yalnızca boşluktan oluşan metni `null`'a düşürür. */
function normalize(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
