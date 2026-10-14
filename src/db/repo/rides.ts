/**
 * Sefer kaydı — günde kırk kez çalışan yol.
 *
 * Buradaki tek amaç HIZ: sürücü tutarı yazar, kaydeder. Komisyon oranı
 * kaynaktan okunur, tutarlar hesaplanır ve ÜÇÜ DE saklanır. Kullanıcı
 * kaynağın oranını sonradan değiştirdiğinde geçmiş seferler değişmez.
 */

import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { getDb } from '../client';
import { earningSources, rides, vehicles } from '../schema';
import type { Ride } from '../schema/earnings';
import type { PaymentMethod } from '../schema/_shared';
import {
  type UnixMs, alive, assertOwned, assertOwnedIfSet, ownedById,
  softDeleteRow, stampNew, updateOwned, withOutbox,
} from './_base';
import { ensureDefaultEarningSource } from './earning-sources';
import { resolveShiftContext } from './shift-context';
import { getCutoffHour } from './settings';
import { type BasisPoints, type Kurus } from '@/lib/money';
import { calculateRideAmounts } from '@/lib/ride';
import { type BusinessDate, toBusinessDate } from '@/lib/business-date';
import { toWholePositive } from '@/lib/whole-number';

export interface NewRideInput {
  grossAmountKurus: Kurus;

  /**
   * Kazanç kaynağı. v1'de sürücüye sorulmuyor; verilmezse tek olan
   * kaynak kullanılıyor (yoksa açılıyor).
   */
  earningSourceId?: string;

  /** Açık vardiya varsa kimliği. Vardiya dışında da sefer olabilir. */
  shiftId?: string | null;
  /** Yalnızca VARDİYASIZ seferde okunur; vardiya varsa araç ondan gelir. */
  vehicleId?: string | null;

  /** Sürücü kesintiyi rakam olarak biliyorsa — oranı ezer. */
  commissionOverrideKurus?: Kurus;

  /** Oranı elle vermek için. Boşsa kaynağın o anki oranı okunur. */
  commissionBps?: BasisPoints;

  tipKurus?: Kurus;
  paymentMethod?: PaymentMethod;
  distanceMeters?: number | null;
  durationSeconds?: number | null;
  notes?: string | null;

  /** Geçmişe kayıt için. Boşsa şimdi. */
  occurredAt?: UnixMs;
}

/**
 * Sefer ekler.
 *
 * KOMİSYON KESİLMEZ. Sefer kaydı yalnızca sürücünün eline geçen brüt
 * tutarı taşır; komisyon vardiya sonunda tek rakam olarak giriliyor
 * (`shifts.commission_kurus`). Sefer başına oran hem girişi
 * yavaşlatıyordu hem de sürücünün doğrulayamadığı bir sayı üretiyordu.
 *
 * `commissionBps` ve `commissionOverrideKurus` alanları duruyor ve
 * varsayılanları sıfır — açıkça verilirse yine çalışırlar, kapı açık.
 */
export function addRide(
  userId: string,
  input: NewRideInput,
  cutoffHour?: number,
  now: UnixMs = Date.now(),
): Ride {
  const occurredAt = input.occurredAt ?? now;
  /**
   * Kesme saati AYARDAN okunuyor, sabitten değil.
   *
   * Varsayılan parametre bırakıldığında her çağıranın ayarı elle
   * geçirmesi gerekiyordu ve hiçbiri geçirmiyordu: okuma yolu sürücünün
   * 06:00'sını kullanırken yazma yolu 04:00 varsayıyor, 05:00'te girilen
   * sefer bir güne yazılıp başka bir günün defterinde aranıyordu.
   */
  const cutoff = cutoffHour ?? getCutoffHour(userId);

  /**
   * SEFER, VARDİYASININ İŞ GÜNÜNE YAZILIR — kendi saatinden türetilmez.
   *
   * Gece 22:00'de açılan vardiya sabah 06:00'da kapanıyor. Saat başına
   * gün hesaplansaydı aynı kesintisiz vardiya iki güne bölünürdü:
   * gece yarısından önceki seferler bir güne, sonrakiler diğerine.
   * Sürücü tek bir iş yaptı, tek bir günde görmeli.
   *
   * Vardiya dışında girilen sefer kendi saatinden gün alır.
   *
   * ARAÇ DA VARDİYADAN gelir: vardiya ortasında Araçlarım'dan başka araç
   * seçilse bile sefer, vardiyanın açıldığı araca yazılır. Seçim bir
   * sonraki vardiyada geçerli. Vardiya bu hesabın değilse reddedilir.
   */
  const shift = input.shiftId ? resolveShiftContext(userId, input.shiftId) : null;
  const businessDate = shift?.businessDate ?? toBusinessDate(occurredAt, cutoff);
  const vehicleId = shift ? shift.vehicleId : (input.vehicleId ?? null);

  /**
   * Bağlanan kaynak ve araç da BU HESABIN olmalı. Denetim her yazmadan
   * önce: reddedilen bir kayıt yarım iz bırakmasın.
   */
  assertOwnedIfSet(earningSources, 'earning_sources', userId, input.earningSourceId);
  if (!shift) assertOwnedIfSet(vehicles, 'vehicles', userId, vehicleId);
  const earningSourceId = input.earningSourceId
    ?? ensureDefaultEarningSource(userId, now).id;

  const amounts = calculateRideAmounts({
    grossAmountKurus: input.grossAmountKurus,
    commissionBps: input.commissionBps ?? (0 as BasisPoints),
    commissionOverrideKurus: input.commissionOverrideKurus,
    tipKurus: input.tipKurus,
  });

  const stamp = stampNew(userId, now);
  return withOutbox('rides', stamp.id, 'upsert', (tx) => (
    tx.insert(rides).values({
      ...stamp,
      shiftId: input.shiftId ?? null,
      earningSourceId,
      vehicleId,
      occurredAt,
      businessDate,
      grossAmountKurus: amounts.grossAmountKurus,
      commissionKurus: amounts.commissionKurus,
      netAmountKurus: amounts.netAmountKurus,
      commissionBps: amounts.commissionBps,
      tipKurus: amounts.tipKurus,
      paymentMethod: input.paymentMethod ?? 'app',
      // Metre ve saniye bulutta integer — ondalık gelirse yuvarlanır.
      distanceMeters: toWholePositive(input.distanceMeters),
      durationSeconds: toWholePositive(input.durationSeconds),
      notes: input.notes?.trim() || null,
    }).returning().get()
  ), now);
}

/**
 * Seferi günceller ve tutarları YENİDEN HESAPLAR.
 *
 * Oran, kaydın kendi içindeki kopyadan alınır — kaynağın bugünkü oranından
 * değil. Sürücü bir seferin tutarını düzeltiyorsa o günkü şartlar geçerli
 * olmalı; aradan geçen sürede oran değiştiyse düzeltme onu getirmemeli.
 *
 * Vardiya, araç ve saat bu yoldan DEĞİŞMİYOR — iş günü onlara bağlı ve
 * düzeltme bir seferi başka güne taşımamalı. Eskiden tipte görünüp
 * sessizce yok sayılıyorlardı.
 *
 * Kayıt bu hesabın değilse `false` döner, hiçbir şey yazılmaz. Yeni bir
 * kaynağa bağlanıyorsa o kaynak da bu hesabın olmalı; DEĞİŞMEYEN bağ
 * yeniden denetlenmiyor — tutarı düzeltmek, eski bir bağ yüzünden
 * reddedilmemeli.
 */
export function updateRide(
  userId: string, id: string,
  patch: Omit<Partial<NewRideInput>, 'shiftId' | 'vehicleId' | 'occurredAt'>,
  now: UnixMs = Date.now(),
): boolean {
  const current = getRide(userId, id);
  if (!current) return false;
  if (patch.earningSourceId !== undefined && patch.earningSourceId !== current.earningSourceId) {
    assertOwned(earningSources, 'earning_sources', userId, patch.earningSourceId);
  }

  const amounts = calculateRideAmounts({
    grossAmountKurus: patch.grossAmountKurus ?? current.grossAmountKurus,
    commissionBps: patch.commissionBps ?? current.commissionBps,
    commissionOverrideKurus: patch.commissionOverrideKurus,
    tipKurus: patch.tipKurus ?? current.tipKurus,
  });

  return updateOwned(rides, 'rides', userId, id, {
    ...(patch.earningSourceId !== undefined
      ? { earningSourceId: patch.earningSourceId } : {}),
    ...(patch.paymentMethod !== undefined
      ? { paymentMethod: patch.paymentMethod } : {}),
    ...(patch.distanceMeters !== undefined
      ? { distanceMeters: toWholePositive(patch.distanceMeters) } : {}),
    ...(patch.durationSeconds !== undefined
      ? { durationSeconds: toWholePositive(patch.durationSeconds) } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes?.trim() || null } : {}),
    grossAmountKurus: amounts.grossAmountKurus,
    commissionKurus: amounts.commissionKurus,
    netAmountKurus: amounts.netAmountKurus,
    commissionBps: amounts.commissionBps,
    tipKurus: amounts.tipKurus,
  }, now);
}

export function deleteRide(userId: string, id: string, now: UnixMs = Date.now()): boolean {
  return softDeleteRow(rides, 'rides', userId, id, now);
}

// ---------------------------------------------------------------------------
// Okuma
// ---------------------------------------------------------------------------

export function getRide(userId: string, id: string): Ride | undefined {
  return getDb().select().from(rides).where(ownedById(rides, userId, id)).get();
}

/** Bir iş gününün seferleri — en yeni üstte. */
export function listRidesOnDate(userId: string, date: BusinessDate): Ride[] {
  return getDb().select().from(rides)
    .where(and(alive(rides, userId), eq(rides.businessDate, date)))
    .orderBy(desc(rides.occurredAt))
    .all();
}

/** Bir vardiyanın seferleri — eskiden yeniye, girildiği sırayla. */
export function listRidesInShift(userId: string, shiftId: string): Ride[] {
  return getDb().select().from(rides)
    .where(and(alive(rides, userId), eq(rides.shiftId, shiftId)))
    .orderBy(asc(rides.occurredAt))
    .all();
}

export function listRidesInRange(
  userId: string, from: BusinessDate, to: BusinessDate,
): Ride[] {
  return getDb().select().from(rides)
    .where(and(
      alive(rides, userId),
      gte(rides.businessDate, from),
      lte(rides.businessDate, to),
    ))
    .orderBy(desc(rides.occurredAt))
    .all();
}
