/**
 * Marka logoları — araç listesinde ve profildeki "Araçlarım" kartında
 * markayı harften daha net tanıtmak için.
 *
 * Logolar kendi sahiplerinin TİCARİ MARKALARIDIR; burada yalnızca
 * sürücünün KENDİ aracının markasını göstermek için kullanılıyor, başka
 * hiçbir amaçla (reklam, onay ima etmek vb.) değil.
 *
 * Kaynak: car-logos-dataset (https://github.com/filippofilip95/car-logos-dataset),
 * MIT lisanslı bir derleme projesi — logo görselleri kendi sahiplerine ait,
 * derleme/dosya yapısı MIT. `logos/optimized` klasöründen 128x128 PNG'e
 * küçültülüp `assets/images/brands/` altına konuldu.
 *
 * CATALOG'daki her marka burada YOK — kataloğa sonradan eklenen ya da
 * (Togg gibi) kaynak veri setinde bulunmayan markalar için eşleşme
 * atlanıyor. Böyle markalarda `brandLogo` null döner ve arayüz baş harf
 * rozetine düşer (bkz. `src/components/ui/brand-badge.tsx`).
 */

export const BRAND_LOGOS: Readonly<Record<string, number>> = {
  Renault: require('../../assets/images/brands/renault.png'),
  Fiat: require('../../assets/images/brands/fiat.png'),
  Volkswagen: require('../../assets/images/brands/volkswagen.png'),
  Toyota: require('../../assets/images/brands/toyota.png'),
  Hyundai: require('../../assets/images/brands/hyundai.png'),
  Ford: require('../../assets/images/brands/ford.png'),
  Honda: require('../../assets/images/brands/honda.png'),
  Opel: require('../../assets/images/brands/opel.png'),
  Peugeot: require('../../assets/images/brands/peugeot.png'),
  Citroen: require('../../assets/images/brands/citroen.png'),
  Dacia: require('../../assets/images/brands/dacia.png'),
  Skoda: require('../../assets/images/brands/skoda.png'),
  Nissan: require('../../assets/images/brands/nissan.png'),
  Kia: require('../../assets/images/brands/kia.png'),
  Seat: require('../../assets/images/brands/seat.png'),
  Mercedes: require('../../assets/images/brands/mercedes.png'),
  BMW: require('../../assets/images/brands/bmw.png'),
  Audi: require('../../assets/images/brands/audi.png'),
  Chevrolet: require('../../assets/images/brands/chevrolet.png'),
  Mitsubishi: require('../../assets/images/brands/mitsubishi.png'),
  Suzuki: require('../../assets/images/brands/suzuki.png'),
  Volvo: require('../../assets/images/brands/volvo.png'),
  Tesla: require('../../assets/images/brands/tesla.png'),
  MG: require('../../assets/images/brands/mg.png'),
  Chery: require('../../assets/images/brands/chery.png'),
  BYD: require('../../assets/images/brands/byd.png'),
  Mazda: require('../../assets/images/brands/mazda.png'),
  Cupra: require('../../assets/images/brands/cupra.png'),
  'Alfa Romeo': require('../../assets/images/brands/alfa-romeo.png'),
  SsangYong: require('../../assets/images/brands/ssangyong.png'),
  Jeep: require('../../assets/images/brands/jeep.png'),
  Mini: require('../../assets/images/brands/mini.png'),
  'Land Rover': require('../../assets/images/brands/land-rover.png'),
  Subaru: require('../../assets/images/brands/subaru.png'),
  DS: require('../../assets/images/brands/ds.png'),
  Lexus: require('../../assets/images/brands/lexus.png'),
  Tata: require('../../assets/images/brands/tata.png'),
  Lada: require('../../assets/images/brands/lada.png'),
  Proton: require('../../assets/images/brands/proton.png'),
  // Togg ve motosiklet markaları (Yamaha, Kuba…): kaynak veri setinde
  // yok — baş harf rozetine düşer. Honda ve Suzuki'nin logosu iki türde
  // de aynı.
};

const LOOKUP: Readonly<Record<string, number>> = Object.fromEntries(
  Object.entries(BRAND_LOGOS).map(([make, asset]) => [make.toLowerCase(), asset]),
);

/** Markanın logosu var mı? Büyük/küçük harf duyarsız arar, yoksa null. */
export function brandLogo(make: string | null | undefined): number | null {
  if (!make) return null;
  return LOOKUP[make.toLowerCase()] ?? null;
}
