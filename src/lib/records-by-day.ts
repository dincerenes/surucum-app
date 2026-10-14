/**
 * Kayıtlar ekranının gün gruplaması.
 *
 * Veritabanı bilmez: kayıtları ve vardiyaları alır, günlere böler.
 *
 * GÜN ANAHTARLARI DÖRT KÜMENİN BİRLEŞİMİ — sefer, gider, yakıt ve
 * VARDİYA. Eskiden günler yalnızca sefer/gider/yakıttan üretiliyor,
 * vardiyalar ancak var olan bir güne iliştiriliyordu: seferi olmayan bir
 * vardiya listede hiç görünmüyordu. Vardiya detayına giden tek yol burası
 * olduğu için o vardiyanın kilometresi ve komisyonu düzeltilemiyor,
 * vardiya silinemiyordu — oysa aynı gün İstatistik'te sayılıyordu
 * (`listDaySummaries` de dört kümeyi birleştiriyor; iki ekran aynı
 * günleri görmeli).
 */

import type { BusinessDate } from './business-date.ts';

export interface DayGroup<E, S> {
  date: BusinessDate;
  /** Yeniden eskiye. */
  entries: E[];
  /** Verildiği sırayla. */
  shifts: S[];
}

export function groupRecordsByDay<
  E extends { at: number },
  S extends { businessDate: BusinessDate },
>(
  entries: readonly { date: BusinessDate; entry: E }[],
  shifts: readonly S[],
): DayGroup<E, S>[] {
  const days = new Map<BusinessDate, DayGroup<E, S>>();
  const dayOf = (date: BusinessDate) => {
    let day = days.get(date);
    if (!day) {
      day = { date, entries: [], shifts: [] };
      days.set(date, day);
    }
    return day;
  };

  for (const { date, entry } of entries) dayOf(date).entries.push(entry);
  for (const shift of shifts) dayOf(shift.businessDate).shifts.push(shift);

  return [...days.values()]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map((d) => ({ ...d, entries: [...d.entries].sort((a, b) => b.at - a.at) }));
}
