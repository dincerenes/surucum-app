/**
 * Vardiyaya bağlı kaydın vardiyadan aldıkları: İŞ GÜNÜ ve ARAÇ.
 *
 * Sefer, gider ve yakıt açık vardiya varken girildiğinde ikisini de
 * vardiyadan alır — kendi saatinden ya da ekranın o an gösterdiği
 * araçtan değil. Gün kuralı gece vardiyası için (kural 3); araç kuralı
 * vardiya ortasında Araçlarım'dan başka araç seçilince kayıtlar o araca
 * kaymasın diye: seçim bir sonraki vardiyada geçerli.
 *
 * Ayrı dosyada, çünkü üç repo da kullanıyor ve vardiya reposu yakıt
 * reposunu içe aktarıyor — döngü olmasın.
 */

import { getDb } from '../client';
import { shifts } from '../schema';
import { ForeignRecordError, ownedById } from './_base';
import type { BusinessDate } from '@/lib/business-date';

export interface ShiftContext {
  businessDate: BusinessDate;
  vehicleId: string;
}

/**
 * Vardiya bu hesabın değilse ya da silinmişse REDDEDİLİR. Sessizce kendi
 * saatinden gün almak, sürücünün vardiyaya bağlı sandığı kaydı başka bir
 * güne yazabilirdi; yabancı vardiyanın gününü almak ise başka bir
 * hesabın defterine bakmaktır.
 */
export function resolveShiftContext(userId: string, shiftId: string): ShiftContext {
  const shift = getDb().select({ businessDate: shifts.businessDate, vehicleId: shifts.vehicleId })
    .from(shifts).where(ownedById(shifts, userId, shiftId)).get();
  if (!shift) throw new ForeignRecordError('shifts', shiftId);
  return shift;
}
