/**
 * Üç satırın yanındaki açıklamalar — eksik girdi uyarıları ve yakıtın
 * nereden sayıldığı.
 *
 * Veritabanı ve arayüz bilmez: özetin eksiklik alanlarından metin
 * üretir. Metin tek yerde, çünkü gün kartı, Anasayfa, vardiya sonu ve
 * İstatistik aynı hesabı gösteriyor ve aynı dili konuşmak zorunda.
 *
 * İKİ TON VAR. Uyarı (`warning`): bir sayı olduğundan İYİ görünüyor,
 * sürücü bir şeyi girmezse gerçek kâr yanlış. Bilgi (`info`): hesap
 * doğru ama sürücünün gördüğü bir kaydın neden düşülmediğini söylüyor —
 * Kayıtlar'da −700 ₺ dolum görüp özette 500 ₺ yakıt gören sürücü
 * sayıları topluyor, tutmazsa sayıya güvenmiyor.
 */

import { type Kurus, formatDecimal, formatKurus } from './money.ts';
import type { DaySummary, FuelLogStatus, FuelSource } from './day-summary.ts';
import type { PeriodTotals } from './stats.ts';

export interface SummaryNote {
  tone: 'warning' | 'info';
  text: string;
}

/**
 * "Cebe kalan"ın alt metni. Eskiden "gerçekleşmiş nakit" yazıyordu; oysa
 * yakıt tüketimden hesaplanabiliyor (km × tüketim × fiyat) ve o gün
 * pompaya ödenenden farklı olabiliyor. İki satır arasındaki TEK fark
 * yıpranma — alt metin tam olarak bunu söylüyor.
 */
export const CASH_PROFIT_CAPTION = 'yıpranma hariç';
export const TRUE_PROFIT_CAPTION = 'yıpranma dahil';

const warn = (text: string): SummaryNote => ({ tone: 'warning', text });
const info = (text: string): SummaryNote => ({ tone: 'info', text });

/** Günün açıklamaları — yalnızca KAPANMIŞ vardiyaların eksikleri. */
export function buildDayNotes(summary: DaySummary): SummaryNote[] {
  const c = summary.completeness;
  const notes: SummaryNote[] = [];

  if (c.distance === 'unknown' && c.fuel === 'unknown') {
    // Yakıt da kilometreye bağlı; iki ayrı uyarı aynı eksiği iki kez söylerdi.
    notes.push(warn(
      'Kilometre girilmediği için yıpranma payı ve yakıt hesaplanmadı; '
      + 'cebe kalan ve gerçek kâr olduğundan iyi görünüyor.',
    ));
  } else {
    if (c.distance === 'unknown') {
      notes.push(warn('Kilometre girilmediği için yıpranma payı hesaplanmadı.'));
    } else if (c.distance === 'partial') {
      notes.push(warn(
        `${c.shiftsMissingDistance} vardiyanın kilometresi girilmemiş; yıpranma payı eksik.`,
      ));
    }

    if (c.fuel === 'unknown') {
      notes.push(warn(
        'Yakıt bilinmiyor: ortalama tüketim ya da litre fiyatı girilmemiş, dolum da yok. '
        + 'Cebe kalan olduğundan iyi görünüyor.',
      ));
    } else if (c.fuel === 'partial') {
      notes.push(warn(
        `${c.shiftsMissingFuel} vardiyanın yakıtı bilinmiyor; cebe kalan olduğundan iyi görünüyor.`,
      ));
    }
  }

  if (c.commission === 'unknown') {
    notes.push(warn('Komisyon girilmemiş; sıfır sayıldı.'));
  } else if (c.commission === 'partial') {
    notes.push(warn(`${c.shiftsMissingCommission} vardiyanın komisyonu girilmemiş; sıfır sayıldı.`));
  }

  if (c.fuelSource === 'filled' && c.closedShiftCount === 0) {
    // Vardiya henüz açık: tüketim "girilmemiş" değil, vardiya sonunda sorulacak.
    notes.push(info(
      'Yakıt şimdilik dolum tutarından sayılıyor; vardiya sonunda ortalama tüketimi '
      + 'girersen tüketimden hesaplanır.',
    ));
  } else if (c.fuelSource === 'filled') {
    notes.push(info('Ortalama tüketim girilmediği için yakıt, kaydedilen dolum tutarından sayıldı.'));
  } else if (c.fuelSource === 'mixed') {
    notes.push(info(
      'Yakıt tüketimden hesaplandı; tüketimi girilmeyen vardiyada dolum tutarı sayıldı.',
    ));
  }
  if (c.fillsNotCountedKurus > 0) {
    notes.push(info(
      `${formatKurus(c.fillsNotCountedKurus)} dolum ayrıca düşülmedi; yakıt tüketimden hesaplandı.`,
    ));
  }
  if (c.offDayFillsKurus > 0) {
    notes.push(info(
      `${formatKurus(c.offDayFillsKurus)} depo alımı hesaba ayrıca girmedi: o gün bu araçla `
      + 'vardiya yok. Yakıt, çalıştığın günlerde sayılıyor.',
    ));
  }

  return notes;
}

/** Dönemin açıklamaları — günlerinkinin toplamından, aynı dürüstlük kuralı. */
export function buildPeriodNotes(totals: PeriodTotals): SummaryNote[] {
  const notes: SummaryNote[] = [];

  if (totals.shiftsMissingDistance > 0) {
    notes.push(warn(
      `${totals.shiftsMissingDistance} vardiyanın kilometresi girilmemiş; yıpranma payı o `
      + 'vardiyalar için hesaplanmadı ve gerçek kâr olduğundan iyi görünüyor.',
    ));
  }
  if (totals.shiftsMissingFuel > 0) {
    notes.push(warn(
      `${totals.shiftsMissingFuel} vardiyanın yakıtı bilinmiyor; cebe kalan olduğundan iyi görünüyor.`,
    ));
  }
  if (totals.shiftsMissingCommission > 0) {
    notes.push(warn(
      `${totals.shiftsMissingCommission} vardiyanın komisyonu girilmemiş; sıfır sayıldı.`,
    ));
  }
  if (totals.fillsNotCountedKurus > 0) {
    notes.push(info(
      `${formatKurus(totals.fillsNotCountedKurus)} dolum ayrıca düşülmedi; o günlerde yakıt `
      + 'tüketimden hesaplandı.',
    ));
  }
  if (totals.offDayFillsKurus > 0) {
    notes.push(info(
      `${formatKurus(totals.offDayFillsKurus)} depo alımı vardiya olmayan günlerde yapıldı; `
      + 'hesaba ayrıca girmedi.',
    ));
  }

  return notes;
}

/**
 * Yakıt satırının etiketi — tutarın NEREDEN geldiğini söyler.
 *
 * Tüketimden: "Yakıt · tüketimden 17,9 lt". Dolumdan: "Yakıt · dolumdan".
 * İkisi birden: "Yakıt · tüketimden 17,9 lt + dolum". Litre tek başına
 * yazıldığında sürücü onu pompadan aldığı litre sanıyordu; oysa km ×
 * ortalama tüketimden hesaplanmış bir sayı. Kaynak yoksa düz "Yakıt".
 */
export function fuelRowLabel(source: FuelSource, volumeMl: number | null): string {
  const litres = volumeMl != null ? `${formatDecimal(volumeMl / 1000)} lt` : null;
  if (source === 'burned' && litres) return `Yakıt · tüketimden ${litres}`;
  if (source === 'mixed' && litres) return `Yakıt · tüketimden ${litres} + dolum`;
  if (source === 'filled') return 'Yakıt · dolumdan';
  return 'Yakıt';
}

/**
 * Yakıt satırı "bilinmiyor" diye mi çizilmeli? Tutar sıfırken yakıtı
 * bilinmeyen vardiya varsa: sıfır "yakıt yakmadı" değil, "bilmiyoruz".
 * Satır gizlenseydi yakıt ekrandan tamamen kayboluyordu.
 */
export function isFuelUnknown(fuelPaid: Kurus, shiftsMissingFuel: number): boolean {
  return fuelPaid === 0 && shiftsMissingFuel > 0;
}

/** Kayıtlar'daki dolum satırının açıklaması; sayılan dolumda `null`. */
export function fuelLogNote(status: FuelLogStatus | undefined): string | null {
  if (status === 'covered') return 'tüketimden sayıldı · ayrıca düşülmedi';
  if (status === 'off_day') return 'depo alımı · hesaba ayrıca girmedi';
  return null;
}
