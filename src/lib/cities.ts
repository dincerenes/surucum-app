/**
 * Türkiye'nin 81 ili.
 *
 * Profil'deki şehir seçimi için. Sıralama Türkçe alfabetik: `localeCompare`
 * ile üretildi (Ç, C'den sonra; Ğ, G'den sonra; I, İ'den önce; Ö, O'dan
 * sonra; Ş, S'den sonra; Ü, U'dan sonra).
 */
export const CITIES: readonly string[] = [
  'Adana',
  'Adıyaman',
  'Afyonkarahisar',
  'Ağrı',
  'Aksaray',
  'Amasya',
  'Ankara',
  'Antalya',
  'Ardahan',
  'Artvin',
  'Aydın',
  'Balıkesir',
  'Bartın',
  'Batman',
  'Bayburt',
  'Bilecik',
  'Bingöl',
  'Bitlis',
  'Bolu',
  'Burdur',
  'Bursa',
  'Çanakkale',
  'Çankırı',
  'Çorum',
  'Denizli',
  'Diyarbakır',
  'Düzce',
  'Edirne',
  'Elazığ',
  'Erzincan',
  'Erzurum',
  'Eskişehir',
  'Gaziantep',
  'Giresun',
  'Gümüşhane',
  'Hakkari',
  'Hatay',
  'Iğdır',
  'Isparta',
  'İstanbul',
  'İzmir',
  'Kahramanmaraş',
  'Karabük',
  'Karaman',
  'Kars',
  'Kastamonu',
  'Kayseri',
  'Kırıkkale',
  'Kırklareli',
  'Kırşehir',
  'Kilis',
  'Kocaeli',
  'Konya',
  'Kütahya',
  'Malatya',
  'Manisa',
  'Mardin',
  'Mersin',
  'Muğla',
  'Muş',
  'Nevşehir',
  'Niğde',
  'Ordu',
  'Osmaniye',
  'Rize',
  'Sakarya',
  'Samsun',
  'Siirt',
  'Sinop',
  'Sivas',
  'Şanlıurfa',
  'Şırnak',
  'Tekirdağ',
  'Tokat',
  'Trabzon',
  'Tunceli',
  'Uşak',
  'Van',
  'Yalova',
  'Yozgat',
  'Zonguldak',
];

/**
 * Türkçe küçük harfe çevirme.
 *
 * `toLowerCase()` "I" harfini "i" yapar, Türkçe'de doğrusu "ı"dır
 * (bkz. `text.ts` — aynı sorunun küçük harf tarafı). Hermes'in
 * `toLocaleLowerCase('tr-TR')` desteği platformdan platforma değiştiği
 * için noktasız I ve noktalı İ'yi önce elle çeviriyoruz.
 */
function lowerTr(text: string): string {
  return text.replace(/I/g, 'ı').replace(/İ/g, 'i').toLowerCase();
}

/**
 * Şehir arama: önce isim başıyla eşleşenler, sonra içinde geçenler.
 *
 * Boş sorgu tüm illeri döndürür (liste ilk açıldığında filtre yokmuş gibi
 * davranması için).
 */
export function searchCities(query: string): string[] {
  const q = lowerTr(query.trim());
  if (!q) return [...CITIES];

  const startsWith: string[] = [];
  const contains: string[] = [];
  for (const city of CITIES) {
    const lower = lowerTr(city);
    if (lower.startsWith(q)) startsWith.push(city);
    else if (lower.includes(q)) contains.push(city);
  }
  return [...startsWith, ...contains];
}
