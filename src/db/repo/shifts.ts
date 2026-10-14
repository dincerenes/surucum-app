/**
 * Vardiya — günlük döngünün iskeleti.
 *
 * Vardiya BAŞLARKEN hiçbir şey sorulmaz: tek tuş, tek satır. Mesafe ve
 * süre vardiya BİTERKEN sürücünün ağzından alınır ve ikisi de isteğe
 * bağlıdır — hiçbir soru akışı bloklamaz.
 */

import { and, desc, eq, gt, gte, isNull, lte, or } from 'drizzle-orm';
import { getDb } from '../client';
import { expenses, fuelLogs, rides, shifts, vehicles } from '../schema';
import { rememberStatedFuelFigures } from './fuel';
import { getCutoffHour } from './settings';
import type { Shift } from '../schema/earnings';
import {
  type UnixMs, alive, assertOwned, enqueue, ownedById, stampNew, updateOwned, withOutbox,
} from './_base';
import { type BusinessDate, toBusinessDate } from '@/lib/business-date';
import { type Kurus, roundHalfAwayFromZero } from '@/lib/money';
import { toWholePositive } from '@/lib/whole-number';

/**
 * Vardiyayı başlatır.
 *
 * Açık vardiya varsa YENİSİ AÇILMAZ, mevcut olan döner. Sürücü butona
 * iki kez basarsa ya da uygulama iki kez açılırsa iki vardiya oluşması
 * TL/saat hesabını bozar ve sürücü bunu fark edemez.
 *
 * Araç BU HESABIN olmalı: yıpranma payı vardiyanın aracından okunuyor ve
 * yabancı bir araç, sürücünün kârını başka birinin oranıyla hesaplatır.
 *
 * Aracın yıpranma katsayısı vardiyaya KOPYALANIR: sonradan araç
 * düzenlense de bu vardiyanın gerçek kârı kaymaz (bkz. `shifts` şeması).
 */
export function startShift(
  userId: string,
  vehicleId: string,
  cutoffHour?: number,
  now: UnixMs = Date.now(),
): Shift {
  assertOwned(vehicles, 'vehicles', userId, vehicleId);
  const open = getOpenShift(userId);
  if (open) return open;

  /** Kesme saati ayardan okunuyor — vardiyanın günü ona bağlı. */
  const cutoff = cutoffHour ?? getCutoffHour(userId);

  const wearPerKmKurus = vehicleWear(userId, vehicleId);
  const stamp = stampNew(userId, now);
  return withOutbox('shifts', stamp.id, 'upsert', (tx) => (
    tx.insert(shifts).values({
      ...stamp,
      vehicleId,
      startedAt: now,
      endedAt: null,
      wearPerKmKurus,
      businessDate: toBusinessDate(now, cutoff),
    }).returning().get()
  ), now);
}

/** Aracın bugünkü katsayısı — yalnızca bu hesabın aracıysa. */
function vehicleWear(userId: string, vehicleId: string): Kurus | null {
  return getDb().select({ w: vehicles.wearPerKmKurus }).from(vehicles)
    .where(and(eq(vehicles.id, vehicleId), eq(vehicles.userId, userId)))
    .get()?.w ?? null;
}

export interface EndShiftInput {
  /**
   * O gün uygulamaya ödenen toplam komisyon — TEK RAKAM, oran değil.
   * Sürücü yüzdesini bilmiyor; eline geçeni ve kesileni biliyor.
   *
   * Boş BİLİNMİYOR, 0 GERÇEKTEN SIFIR: ikisi hesaba aynı girer ama
   * özet yalnızca boş bırakılanı "girilmemiş" diye söyler.
   */
  commissionKurus?: Kurus | null;

  /**
   * Vardiya boyunca kat edilen yol — kilometre SAYACI DEĞİL.
   * Boşsa yıpranma payı da yakıt maliyeti de hesaplanmaz, tahmin edilmez.
   *
   * TAM SAYI olarak yazılır: ondalık gelirse burada yuvarlanır. Bulutta
   * sütun `integer`; "238,5" gönderilseydi Postgres reddeder ve bütün
   * vardiya yedeği takılırdı (bkz. `whole-number.ts`). Süre ve tüketim
   * de aynı kurala tabi.
   */
  distanceKm?: number | null;

  /** Aracın ortalama tüketimi, 100 km başına mililitre (7,5 lt → 7500). */
  fuelConsumptionPer100Km?: number | null;

  /** O gün geçerli birim yakıt fiyatı, kuruş/litre. */
  fuelPriceKurus?: Kurus | null;

  /**
   * Fiilen çalışılan süre, dakika. Damga farkını EZER: sürücü mola verir
   * ve vardiyayı kapatmayı unutur. Boşsa damga farkına düşülür.
   */
  workedMinutes?: number | null;

  notes?: string | null;
}

/**
 * Vardiyayı bitirir.
 *
 * Zaten kapalı bir vardiyayı yeniden kapatmaz — `endedAt` korunur.
 * Sürücü geçmiş bir vardiyanın kilometresini sonradan düzeltebilmeli,
 * ama bitiş saati o düzeltmeyle kaymamalı.
 */
export function endShift(
  userId: string, id: string, input: EndShiftInput = {}, now: UnixMs = Date.now(),
): boolean {
  const current = getShift(userId, id);
  if (!current) return false;

  const changed = updateOwned(shifts, 'shifts', userId, id, {
    endedAt: current.endedAt ?? now,
    /**
     * Kopyası olmayan vardiya (bu sütundan önceki bir sürümde açılıp
     * buluttan öyle inmiş) kapanırken bir kez doldurulur. Dolu olan
     * ASLA değiştirilmez — düzeltme yalnızca sahiplik sorusundan geçer.
     */
    ...(current.wearPerKmKurus == null
      ? { wearPerKmKurus: vehicleWear(userId, current.vehicleId) } : {}),
    commissionKurus: sanitizeCommission(input.commissionKurus),
    fuelConsumptionPer100Km: toWholePositive(input.fuelConsumptionPer100Km),
    fuelPriceKurus: sanitizeAmount(input.fuelPriceKurus),
    distanceKm: toWholePositive(input.distanceKm),
    workedMinutes: toWholePositive(input.workedMinutes),
    ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
  }, now);
  if (!changed) return false;

  // Bir dahaki vardiya sonunda alanlar dolu gelsin diye araca hatırlatılıyor.
  rememberIfLatest(userId, current, input, now);
  return true;
}

/**
 * Kapanmış vardiyanın mesafe/süre bilgisini sonradan düzeltir.
 *
 * Tüketim ve fiyat burada da ARACA HATIRLATILIYOR, `endShift`'te olduğu
 * gibi. Hatırlatmasaydık: vardiyayı tüketim girmeden kapatıp sonradan
 * detaydan düzelten sürücünün aracında değer boş kalır ve bir sonraki
 * vardiya sonunda alan yine boş gelirdi — aynı sayıyı her seferinde
 * yeniden yazmak zorunda kalırdı.
 *
 * Ama YALNIZCA o aracın en yeni vardiyası hatırlatıyor (`rememberIfLatest`).
 */
export function updateShiftTotals(
  userId: string, id: string, input: EndShiftInput, now: UnixMs = Date.now(),
): boolean {
  const current = getShift(userId, id);
  if (!current) return false;

  const changed = updateOwned(shifts, 'shifts', userId, id, {
    ...(input.commissionKurus !== undefined
      ? { commissionKurus: sanitizeCommission(input.commissionKurus) } : {}),
    ...(input.fuelConsumptionPer100Km !== undefined
      ? { fuelConsumptionPer100Km: toWholePositive(input.fuelConsumptionPer100Km) } : {}),
    ...(input.fuelPriceKurus !== undefined
      ? { fuelPriceKurus: sanitizeAmount(input.fuelPriceKurus) } : {}),
    ...(input.distanceKm !== undefined
      ? { distanceKm: toWholePositive(input.distanceKm) } : {}),
    ...(input.workedMinutes !== undefined
      ? { workedMinutes: toWholePositive(input.workedMinutes) } : {}),
    ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
  }, now);
  if (!changed) return false;

  rememberIfLatest(userId, current, input, now);
  return true;
}

/**
 * Vardiyanın tüketim ve fiyatını araca hatırlatır — yalnızca o aracın
 * EN YENİ vardiyasıysa.
 *
 * Araçtaki değer sürücünün SON beyanı. İki ay önceki bir vardiyanın
 * yalnızca kilometresini düzelten sürücü, o vardiyanın eski litre
 * fiyatını da (ekran alanları kaydın değeriyle açılıyor) araca geri
 * yazıyordu; bir sonraki vardiya sonu bayat fiyatla açılıyor ve
 * onaylanınca yeni günün yakıtı yanlış hesaplanıyordu.
 */
function rememberIfLatest(
  userId: string, shift: Shift, input: EndShiftInput, now: UnixMs,
): void {
  const newer = getDb().select({ id: shifts.id }).from(shifts)
    .where(and(
      alive(shifts, userId),
      eq(shifts.vehicleId, shift.vehicleId),
      or(
        gt(shifts.startedAt, shift.startedAt),
        and(eq(shifts.startedAt, shift.startedAt), gt(shifts.id, shift.id)),
      ),
    ))
    .get();
  if (newer) return;

  rememberStatedFuelFigures(
    userId, shift.vehicleId, input.fuelConsumptionPer100Km, input.fuelPriceKurus, now,
  );
}

/**
 * Vardiyayı ve ONA BAĞLI BÜTÜN KAYITLARI siler — yolcular, giderler, dolumlar.
 *
 * Her kayıt bir vardiyaya ait (sürücünün kararı: "vardiya dışı bir şey
 * girilip çıkmasın"). Eskiden vardiya silinince yolcuları kalıyordu; o
 * kayıtlar hiçbir vardiyanın kartında görünmüyor ama toplamlara giriyordu.
 *
 * Tek işlem: yarısı silinip yarısı kalan bir vardiya olmaz. Her silinen
 * satır aynı işlemde kuyruğa düşüyor, bulutta da silinsin diye.
 */
export function deleteShift(userId: string, id: string, now: UnixMs = Date.now()): boolean {
  if (!getShift(userId, id)) return false;
  return getDb().transaction((tx) => {
    const children = [
      { table: rides, name: 'rides' as const },
      { table: expenses, name: 'expenses' as const },
      { table: fuelLogs, name: 'fuel_logs' as const },
    ];
    for (const { table, name } of children) {
      const ids = tx.select({ id: table.id }).from(table)
        .where(and(alive(table, userId), eq(table.shiftId, id))).all()
        .map((r) => r.id);
      for (const childId of ids) {
        tx.update(table).set({ deletedAt: now, updatedAt: now })
          .where(and(eq(table.id, childId), eq(table.userId, userId))).run();
        enqueue(tx, name, childId, 'delete', now);
      }
    }
    tx.update(shifts).set({ deletedAt: now, updatedAt: now })
      .where(and(eq(shifts.id, id), eq(shifts.userId, userId))).run();
    enqueue(tx, 'shifts', id, 'delete', now);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Okuma
// ---------------------------------------------------------------------------

/**
 * Açık vardiya. En fazla bir tane olmalı; yine de en yenisi alınıyor —
 * eski bir hatadan iki açık vardiya kaldıysa sürücü en azından kilitlenmez.
 */
export function getOpenShift(userId: string): Shift | undefined {
  return getDb().select().from(shifts)
    .where(and(alive(shifts, userId), isNull(shifts.endedAt)))
    .orderBy(desc(shifts.startedAt))
    .get();
}

export function getShift(userId: string, id: string): Shift | undefined {
  return getDb().select().from(shifts).where(ownedById(shifts, userId, id)).get();
}

/** Bir iş gününün vardiyaları. */
export function listShiftsOnDate(userId: string, date: BusinessDate): Shift[] {
  return getDb().select().from(shifts)
    .where(and(alive(shifts, userId), eq(shifts.businessDate, date)))
    .orderBy(desc(shifts.startedAt))
    .all();
}

/** İki iş günü arasındaki vardiyalar — uçlar dahil. */
export function listShiftsInRange(
  userId: string, from: BusinessDate, to: BusinessDate,
): Shift[] {
  return getDb().select().from(shifts)
    .where(and(
      alive(shifts, userId),
      gte(shifts.businessDate, from),
      lte(shifts.businessDate, to),
    ))
    .orderBy(desc(shifts.startedAt))
    .all();
}

/** Son kapanmış vardiya — arayüzde "geçen vardiyan" karşılaştırması için. */
export function getLastClosedShift(userId: string): Shift | undefined {
  return getDb().select().from(shifts)
    .where(alive(shifts, userId))
    .orderBy(desc(shifts.startedAt))
    .all()
    .find((s) => s.endedAt != null);
}


/**
 * Fiyatı temizler: negatif ve sıfır `null` olur — sıfır litre fiyatı
 * "bilinmiyor" demektir, bedava yakıt değil.
 */
function sanitizeAmount(value: Kurus | null | undefined): Kurus | null {
  if (value == null) return null;
  if (!Number.isFinite(value) || value <= 0) return null;
  return roundHalfAwayFromZero(value) as Kurus;
}

/**
 * Komisyonu temizler: negatif `null` olur — negatif bir tutar komisyonu
 * GELİRE çevirirdi. SIFIR KORUNUR: sıfır komisyon ile "komisyon
 * girilmedi" hesaba aynı girer ama aynı şey değil. Eskiden ikisi de boş
 * kaydediliyordu ve özet, 0 yazan sürücüye komisyonu girmediğini
 * söyleyemiyordu — ya da söylerse yanlış söylüyordu.
 */
function sanitizeCommission(value: Kurus | null | undefined): Kurus | null {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < 0) return null;
  return roundHalfAwayFromZero(value) as Kurus;
}
