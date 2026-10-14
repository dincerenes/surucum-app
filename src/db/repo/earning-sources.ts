/**
 * Kazanç kaynağı.
 *
 * v1'DE SÜRÜCÜYE HİÇ SORULMUYOR ve arayüzde görünmüyor. Hedef kitle tek
 * bir platform üzerinden çalışıyor; her sefer için "bu para nereden
 * geldi" diye sormak, cevabı hep aynı olan bir soru sormaktır ve sefer
 * girişini yavaşlatır.
 *
 * Tek satır otomatik açılıyor (`ensureDefaultEarningSource`) ve seferler
 * ona bağlanıyor. Tablo duruyor çünkü ileride birden fazla kaynakla
 * çalışan sürücü desteklenirse kapı açık; bugün o kapıdan geçen yok.
 *
 * Uygulama hiçbir yerde üçüncü taraf marka adı taşımaz — tohum veride bile.
 */

import { asc } from 'drizzle-orm';
import { getDb } from '../client';
import { earningSources } from '../schema';
import type { EarningSource } from '../schema/earnings';
import {
  type UnixMs, alive, ownedById, softDeleteRow, stampNew, updateOwned, withOutbox,
} from './_base';
import { type BasisPoints, clampBps } from '@/lib/money';
import { pickDuplicatesToRemove } from '@/lib/settings-merge';

export interface NewEarningSourceInput {
  name: string;
  /** Komisyon oranı, baz puan: 2500 = %25,00. */
  defaultCommissionBps?: BasisPoints;
  colorHex?: string | null;
  sortOrder?: number;
}

export function createEarningSource(
  userId: string, input: NewEarningSourceInput, now: UnixMs = Date.now(),
): EarningSource {
  const stamp = stampNew(userId, now);
  return withOutbox('earning_sources', stamp.id, 'upsert', (tx) => (
    tx.insert(earningSources).values({
      ...stamp,
      name: input.name.trim(),
      defaultCommissionBps: clampBps(input.defaultCommissionBps ?? 0),
      colorHex: input.colorHex ?? null,
      sortOrder: input.sortOrder ?? 0,
    }).returning().get()
  ), now);
}

export type EarningSourcePatch = Partial<NewEarningSourceInput> & {
  isActive?: boolean;
};

/**
 * Kaynağı günceller.
 *
 * ORAN DEĞİŞİKLİĞİ GEÇMİŞE İŞLEMEZ. Her sefer kaydı, oluşturulduğu andaki
 * oranın kopyasını ve hesaplanmış tutarları kendi içinde taşıyor; buradaki
 * değişiklik yalnızca bundan sonraki seferleri etkiler.
 */
export function updateEarningSource(
  userId: string, id: string, patch: EarningSourcePatch, now: UnixMs = Date.now(),
): boolean {
  return updateOwned(earningSources, 'earning_sources', userId, id, {
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.defaultCommissionBps !== undefined
      ? { defaultCommissionBps: clampBps(patch.defaultCommissionBps) } : {}),
    ...(patch.colorHex !== undefined ? { colorHex: patch.colorHex } : {}),
    ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
    ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
  }, now);
}

export function deleteEarningSource(
  userId: string, id: string, now: UnixMs = Date.now(),
): boolean {
  return softDeleteRow(earningSources, 'earning_sources', userId, id, now);
}

export function listEarningSources(userId: string): EarningSource[] {
  return getDb().select().from(earningSources)
    .where(alive(earningSources, userId))
    .orderBy(asc(earningSources.sortOrder), asc(earningSources.createdAt))
    .all();
}

export function listActiveEarningSources(userId: string): EarningSource[] {
  return listEarningSources(userId).filter((s) => s.isActive);
}

export function getEarningSource(userId: string, id: string): EarningSource | undefined {
  return getDb().select().from(earningSources)
    .where(ownedById(earningSources, userId, id)).get();
}

/**
 * Sürücünün tek kazanç kaynağı — yoksa açar.
 *
 * Adı sürücüye GÖSTERİLMİYOR; seferler bir kaynağa bağlanmak zorunda
 * olduğu için var. Nötr ve tanımlayıcı: hiçbir platforma işaret etmiyor.
 */
export function ensureDefaultEarningSource(
  userId: string, now: UnixMs = Date.now(),
): EarningSource {
  const existing = listActiveEarningSources(userId);

  /**
   * ÇOĞALMA TEMİZLENİYOR. Bu fonksiyon çekme tamamlanmadan yerelde bir
   * satır açıyor, senkron buluttakini indiriyor ve iki "Sefer geliri"
   * oluşuyor. v1'de kaynak arayüzde görünmediği için zararsız duruyor
   * ama seferler iki farklı kimliğe bağlanıyor; ileride kaynak bazlı
   * rapor gerekirse aynı iş iki kaynağa bölünmüş görünür.
   *
   * Seferlerin `earning_source_id`'si TAŞINMIYOR: geçmiş kayıt kendi
   * oluşturulduğu andaki bağı korumalı ve silinen kaynak yalnızca
   * yumuşak siliniyor, satır duruyor.
   */
  const duplicates = pickDuplicatesToRemove(existing);
  if (duplicates) {
    for (const id of duplicates.removeIds) deleteEarningSource(userId, id, now);
    return duplicates.keep;
  }

  if (existing.length > 0) return existing[0];
  return createEarningSource(userId, { name: 'Sefer geliri' }, now);
}
