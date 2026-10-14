/**
 * Sürüş ekranındaki "normal vardiyan" halkasının verisi.
 *
 * Yalnızca okur; hangi vardiyanın sayılacağı ve ortanca `src/lib/pace.ts`
 * içinde ve native SQLite olmadan test ediliyor.
 */

import { and, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import { getDb } from '../client';
import { rides, shifts } from '../schema';
import { alive } from './_base';
import type { BusinessDate } from '@/lib/business-date';
import type { Kurus } from '@/lib/money';
import { type ShiftGross, paceBaseline, paceWindowStart } from '@/lib/pace';

/**
 * Penceredeki KAPANMIŞ vardiyaların cirosu — yolcusu olanlar.
 *
 * Ciro canlı ekrandaki büyük sayıyla AYNI tanım: yolcuların brüt tutarı
 * (`useDriver` → `shiftGross`). Bahşiş ayrı bir sütun ve canlı sayıda
 * yok; burada da yok, yoksa iki taraf farklı şeyi ölçerdi.
 *
 * İç birleştirme yolcusuz vardiyayı kendiliğinden dışarıda bırakıyor.
 * Silinmiş yolcu da, başka hesabın yolcusu da sayılmıyor.
 */
export function listClosedShiftGrosses(
  userId: string, from: BusinessDate, to: BusinessDate,
): ShiftGross[] {
  return getDb().select({
    date: shifts.businessDate,
    gross: sql<Kurus>`sum(${rides.grossAmountKurus})`,
  }).from(shifts)
    .innerJoin(rides, and(eq(rides.shiftId, shifts.id), alive(rides, userId)))
    .where(and(
      alive(shifts, userId),
      isNotNull(shifts.endedAt),
      gte(shifts.businessDate, from),
      lte(shifts.businessDate, to),
    ))
    .groupBy(shifts.id)
    .all()
    .map((r) => ({ date: r.date as BusinessDate, gross: Number(r.gross) as Kurus }));
}

/**
 * Sürücünün normal vardiyasının cirosu, `date` (açık vardiyanın iş günü)
 * itibarıyla. Yeterli geçmiş yoksa `null` — halka çizilmez.
 */
export function getPaceBaseline(userId: string, date: BusinessDate): Kurus | null {
  return paceBaseline(listClosedShiftGrosses(userId, paceWindowStart(date), date), date);
}
