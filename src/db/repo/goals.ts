/**
 * Kazanç hedefi.
 *
 * HEDEF CEBE KALANA konur, ciroya değil (`targetNetKurus`). Sürücünün
 * önemsediği kaç para döndürdüğü değil, kaç para kaldığı.
 *
 * Hedef değiştiğinde eski satır GÜNCELLENMEZ, kapatılıp yenisi açılır:
 * dünün hedefi dünün hedefidir. Üzerine yazsaydık geçmiş günler bugün
 * konan hedefe göre değerlendirilirdi ve tutturulmuş bir gün sonradan
 * tutturulmamış görünürdü.
 */

import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../client';
import { goals } from '../schema';
import type { Goal } from '../schema/system';
import type { GoalPeriod } from '../schema/_shared';
import { type UnixMs, alive, softDeleteRow, stampNew, updateOwned, withOutbox } from './_base';
import { getCutoffHour } from './settings';
import {
  type BusinessDate, addDays, maxBusinessDate, todayBusinessDate,
} from '@/lib/business-date';
import type { Kurus } from '@/lib/money';

/**
 * Dönemin aktif hedefini belirler; varsa eskisini kapatır.
 *
 * Tutar sıfır ya da negatifse hedef KALDIRILIR — sürücü alanı boşaltarak
 * hedeften vazgeçebilmeli, sıfır bir hedefe mahkûm olmamalı.
 */
export function setGoal(
  userId: string,
  targetNetKurus: Kurus | null,
  period: GoalPeriod = 'daily',
  now: UnixMs = Date.now(),
): Goal | null {
  const today = todayBusinessDate(getCutoffHour(userId), new Date(now));
  const current = getActiveGoal(userId, period);

  if (current) {
    /**
     * Aynı tutar yeniden konduysa dokunulmuyor: her açılışta satır
     * kapatıp açmak, hiç değişmemiş bir hedef için geçmiş üretir.
     */
    if (targetNetKurus != null && targetNetKurus === current.targetNetKurus) {
      return current;
    }
    /**
     * Bitiş günü başlangıçtan ÖNCE olamaz.
     *
     * Hedef konduğu gün değiştirilirse "dün" damgası, startDate'i bugün
     * olan bir satıra endDate = dün yazardı ve satır negatif uzunlukta
     * bir dönem olarak buluta giderdi. Aynı gün değişen hedef, o gün
     * başlayıp o gün biten bir hedeftir.
     */
    closeGoal(userId, current.id, maxBusinessDate(current.startDate, addDays(today, -1)), now);
  }

  if (targetNetKurus == null || !Number.isFinite(targetNetKurus) || targetNetKurus <= 0) {
    return null;
  }

  const stamp = stampNew(userId, now);
  return withOutbox('goals', stamp.id, 'upsert', (tx) => (
    tx.insert(goals).values({
      ...stamp,
      period,
      targetNetKurus,
      startDate: today,
      endDate: null,
      isActive: true,
    }).returning().get()
  ), now);
}

/** Hedefi kapatır — silmez, bitiş gününü damgalar. */
function closeGoal(userId: string, id: string, endDate: BusinessDate, now: UnixMs): void {
  updateOwned(goals, 'goals', userId, id, { isActive: false, endDate }, now);
}

export function deleteGoal(userId: string, id: string, now: UnixMs = Date.now()): boolean {
  return softDeleteRow(goals, 'goals', userId, id, now);
}

/** Dönemin yürürlükteki hedefi — en yenisi. */
export function getActiveGoal(
  userId: string, period: GoalPeriod = 'daily',
): Goal | undefined {
  return getDb().select().from(goals)
    .where(and(
      alive(goals, userId),
      eq(goals.period, period),
      eq(goals.isActive, true),
    ))
    .orderBy(desc(goals.createdAt))
    .get();
}

/** Yürürlükteki günlük hedefin tutarı. Hedef yoksa `null`. */
export function getDailyGoalKurus(userId: string): Kurus | null {
  return getActiveGoal(userId, 'daily')?.targetNetKurus ?? null;
}

export function listGoals(userId: string): Goal[] {
  return getDb().select().from(goals)
    .where(alive(goals, userId))
    .orderBy(desc(goals.createdAt))
    .all();
}
