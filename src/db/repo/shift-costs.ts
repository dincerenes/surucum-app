/**
 * Bir vardiyanın gider ve yakıt satırları — tek liste, yeniden eskiye.
 *
 * Canlı vardiya ekranı ve vardiya detayı aynı listeyi gösteriyor; satır
 * başlığı ("Yemek", "Yakıt · 25 lt") iki ekranda farklı yazılmasın diye
 * tek yerde üretiliyor.
 *
 * Tutar KAYDIN tutarı: dolum için ödenen para. Vardiya sonunda tüketim
 * girilirse yakıt maliyeti tüketimden hesaplanır ve bu dolum ayrıca
 * düşülmez (`day-summary.ts`, `collectFuel`) — liste ödeneni gösteriyor,
 * hesabın son yakıt rakamını değil.
 */

import { FUEL_UNIT_LABELS } from '../schema/_shared';
import type { Kurus } from '@/lib/money';
import { formatDecimal } from '@/lib/money';
import { listExpenseCategories, listExpensesInShift } from './expenses';
import { listFuelLogsInShift } from './fuel';

export interface ShiftCost {
  kind: 'gider' | 'yakit';
  id: string;
  at: number;
  title: string;
  amount: Kurus;
}

export function listShiftCosts(userId: string, shiftId: string): ShiftCost[] {
  const categories = new Map(listExpenseCategories(userId).map((c) => [c.id, c.name] as const));
  return [
    ...listExpensesInShift(userId, shiftId).map((e): ShiftCost => ({
      kind: 'gider', id: e.id, at: e.occurredAt,
      title: categories.get(e.categoryId) ?? 'Gider', amount: e.amountKurus,
    })),
    ...listFuelLogsInShift(userId, shiftId).map((f): ShiftCost => {
      // Birim yakıt türünden: elektrikte kWh, CNG'de kg. Hep "lt" yazılınca
      // 40 kWh'lik şarj "40 lt" görünüyordu.
      const name = f.fuelType === 'electric' ? 'Şarj' : 'Yakıt';
      return {
        kind: 'yakit', id: f.id, at: f.occurredAt,
        title: f.volumePer1000 > 0
          ? `${name} · ${formatDecimal(f.volumePer1000 / 1000)} ${FUEL_UNIT_LABELS[f.fuelType]}`
          : name,
        amount: f.totalAmountKurus,
      };
    }),
  ].sort((a, b) => b.at - a.at);
}
