/**
 * Tam sayı alanlar — kilometre, dakika, 100 km başına mililitre.
 *
 * Bu sütunlar bulutta `integer`. Yerelde SQLite her sayıyı kabul ediyor:
 * "238,5" yazılan kilometre cihazda sorunsuz `real` olarak duruyor, ama
 * Postgres onu `invalid input syntax for type integer` ile reddediyor.
 * Gönderim tablonun bütün bekleyen satırlarını tek istekte yolladığı
 * için tek bir ondalık kilometre o tablonun yedeğini kalıcı olarak
 * durduruyordu — sürücü bunu hiçbir yerde görmüyordu.
 *
 * Sürücü kilometreyi zaten tam sayı söylüyor ("bugün 280 yaptım");
 * ondalık desteklemek yerine sınırda yuvarlıyoruz. Yuvarlama kuralı
 * para ile aynı: sıfırdan uzağa yarım (`roundHalfAwayFromZero`).
 */

import { roundHalfAwayFromZero } from './money.ts';
import { readDecimal } from './number-input.ts';

/**
 * Pozitif tam sayıya yuvarlar; boş, bozuk, sıfır ve negatif `null`.
 *
 * Sıfır "bilinmiyor" sayılıyor, "sıfır kilometre yaptı" değil: sıfır
 * yazsaydık yıpranma payı sıfır çıkar ve rapor sessizce yanlış olurdu.
 * 0,4 km da yuvarlanınca sıfıra düştüğü için bilinmiyor sayılır.
 *
 * Repo katmanının son savunma hattı — arayüze güvenmiyor.
 */
export function toWholePositive(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const whole = roundHalfAwayFromZero(value);
  return whole > 0 ? whole : null;
}

/**
 * Sürücünün yazdığı kilometreyi okur: "238" → 238, "238,5" → 239,
 * "150.000" → 150000.
 *
 * Binlik noktası KABUL EDİLİYOR: alan yazarken basamakları kendisi
 * ayırıyor (`number-input.ts`), aracın 150.000 km'si başka türlü
 * okunamazdı. Okunamayan girdi `null` döner, sıfıra düşmez.
 */
export function parseWholeKm(raw: string): number | null {
  return toWholePositive(readDecimal(raw));
}
