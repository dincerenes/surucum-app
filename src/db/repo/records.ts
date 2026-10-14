/**
 * Kayıtlar listesinin okuma yolu — dönemin vardiyaları ve dönem toplamı.
 *
 * Kayıtlar sekmesi ve aylık arşivin ay sayfası AYNI listeyi gösteriyor;
 * ikisi ayrı okusaydı biri güncellenip diğeri unutulurdu.
 *
 * "VARDİYA DIŞI" KAYIT YOK. Yolcu, gider ve yakıt yalnızca açık vardiyada
 * giriliyor; vardiya silinince kayıtları da siliniyor (`deleteShift`).
 * Listede her şey bir vardiya kartının içinde.
 */

import type { UnixMs } from './_base';
import { type ShiftSummary, listDaySummaries, listShiftSummariesInRange } from './summary';
import type { BusinessDate } from '@/lib/business-date';
import { type PeriodTotals, calculatePeriodTotals } from '@/lib/stats';

export interface RecordItem {
  key: string;
  data: ShiftSummary;
}

export interface PeriodRecords {
  /** Vardiyalar, en yeni önce. */
  items: RecordItem[];
  /** Dönem toplamı — İstatistik'le aynı hesap (günlerin özetinden). */
  totals: PeriodTotals;
}

export function listPeriodRecords(
  userId: string, from: BusinessDate, to: BusinessDate, now: UnixMs = Date.now(),
): PeriodRecords {
  return {
    items: listShiftSummariesInRange(userId, from, to, now)
      .map((s) => ({ key: s.shift.id, data: s })),
    totals: calculatePeriodTotals(listDaySummaries(userId, from, to, now)),
  };
}
