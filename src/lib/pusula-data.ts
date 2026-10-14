/**
 * PUSULA — şehir bazında talep TAHMİNİ. Yalnızca tipler ve veri; mantık
 * `pusula.ts` içinde.
 *
 * BURADAKİ HER SAYI BİR TAHMİNDİR. Hiçbiri sürücü kaydından ya da bir
 * platformun talep verisinden gelmiyor; ekran bunu "Tahmini" etiketiyle
 * açıkça söylüyor (bkz. docs/mimari.md, "Bilinmeyen tahmin edilmez": tahmin
 * yapıyorsak tahmin olduğunu saklamıyoruz).
 *
 * KAYNAK VE YÖNTEM (Eylül 2026): belediyelerin yayımladığı ulaşım ve
 * hareketlilik raporları, havalimanlarının aylık yolcu istatistikleri,
 * kamuya açık trafik yoğunluğu endeksleri ve yerel haberler tarandı.
 * Saatlik eğriler trafik ve toplu taşıma yoğunluk saatlerinden, ay
 * katsayıları havalimanı ve turizm mevsimselliğinden (sönümlenerek)
 * türetildi; bölgeler ve saatleri bu kaynaklarla yargının birleşimi.
 *
 * ÖLÇEK: `hourly` ve `dayOfWeek` 0–100 arası tam sayı, şehir başına TEK
 * ölçek — o şehrin en yoğun saati (ya da günü) 100. Şehirler arası
 * karşılaştırma anlamsız: İzmir'in 80'i İstanbul'un 80'i değil.
 * `monthFactor` ~1,0 çevresinde bir çarpan (0,7–1,3).
 *
 * TAKVİM GÜNÜ KURALI: `hourly` profilleri TAKVİM gününün saatine göre.
 * Cuma gecesi 01:00, Cumartesi takvim gününün 01:00'i olduğu için
 * `saturday[1]`de duruyor. Sürücü günü (06:00–06:00) mantık katmanında
 * iki takvim gününden birleştiriliyor; veriyi o kurala göre yazmak her
 * profilin ucuna bir önceki gecenin kuyruğunu gömerdi.
 *
 * GECE YARISINI GEÇEN PENCERE: `toHour <= fromHour` ise pencere gece
 * yarısını geçiyor ve BAŞLADIĞI güne ait. `{ days: [5], 22 → 3 }`
 * Cuma 22:00'den Cumartesi 03:00'e kadar sürüyor. `toHour` hariç;
 * `toHour: 24` gece yarısında biten pencere.
 *
 * MARKA ADI YASAĞI: bölge adlarında ve açıklamalarda AVM, otel, şirket,
 * özel üniversite, sponsorlu stat adı ya da uygulama adı geçmiyor.
 * Yalnızca kamuya ait yerler (semt, meydan, havalimanı, otogar, gar,
 * devlet üniversitesi, kamu hastanesi) adıyla anılıyor. Maç günleri
 * önceden bilinemediği için stat çevresi bölgesi veride yok.
 *
 * v2: sürücüler yolcu kaydettikçe aynı şekle (`CityProfile`) gerçek
 * saatlik talep yazılacak ve bu tahminin yerini alacak ya da onunla
 * harmanlanacak (`PusulaSource`: 'surucu' | 'karma'). Arayüz yalnızca
 * `DemandModel`'i okuyor; kaynağın değişmesi ekranı değiştirmiyor.
 */

/** İ = U+0130; `CITIES` listesindeki yazımla birebir. */
export type PusulaCity = 'İstanbul' | 'Ankara' | 'İzmir' | 'Antalya';

export const PUSULA_CITIES: readonly PusulaCity[] = ['İstanbul', 'Ankara', 'İzmir', 'Antalya'];

/** weekday = Pazartesi–Perşembe. Cuma ayrı: akşamı hafta sonuna açılıyor. */
export type HourlyProfileKey = 'weekday' | 'friday' | 'saturday' | 'sunday';

export type ZoneKind =
  | 'havalimani'
  | 'otogar-gar'
  | 'is-merkezi'
  | 'eglence-gece'
  | 'alisveris'
  | 'universite'
  | 'turistik'
  | 'hastane'
  | 'sahil'
  | 'konut-yogun'
  | 'etkinlik'
  | 'diger';

export type Season = 'all' | 'summer' | 'winter' | 'school-term';

/** ISO gün numarası: 1 = Pazartesi … 7 = Pazar. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * Bir bölgenin hareketli olduğu saat aralığı. `toHour` HARİÇ;
 * `toHour <= fromHour` ise gece yarısını geçer ve BAŞLADIĞI güne aittir;
 * `toHour` 24 olabilir.
 */
export interface ZoneWindow {
  days: readonly IsoWeekday[];
  fromHour: number;
  toHour: number;
  intensity: 1 | 2 | 3;
}

export interface Zone {
  id: string;
  name: string;
  district: string;
  kind: ZoneKind;
  windows: readonly ZoneWindow[];
  season: Season;
  /** Tek satır, en fazla 70 karakter: bölge neden o saatlerde hareketli. */
  reason: string;
}

export interface CityProfile {
  /** 24 değer, TAKVİM günü saatine göre (Cuma gecesi 01:00 = saturday[1]). */
  hourly: Readonly<Record<HourlyProfileKey, readonly number[]>>;
  /** 7 değer, Pazartesi … Pazar; en yoğun gün 100. */
  dayOfWeek: readonly number[];
  /** 12 değer, Ocak … Aralık; ~1,0. */
  monthFactor: readonly number[];
  zones: readonly Zone[];
}

/**
 * Ay indeksleri 0–11. Okul dönemi Eylül–Ocak ve Mart–Mayıs: Şubat
 * yarıyıl tatili ve yaz dışarıda.
 */
export const SEASON_MONTHS: Readonly<Record<Season, readonly number[]>> = {
  all: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  summer: [5, 6, 7, 8],
  winter: [11, 0, 1],
  'school-term': [8, 9, 10, 11, 0, 2, 3, 4],
};

export const PUSULA_DATA_UPDATED = 'Eylül 2026';

export const PUSULA_DATA: Readonly<Record<PusulaCity, CityProfile>> = {
  'İstanbul': {
    hourly: {
      weekday: [30, 20, 14, 10, 10, 16, 30, 55, 70, 58, 45, 44, 47, 48, 50, 56, 66, 82, 90, 84, 70, 60, 52, 42],
      friday: [32, 22, 15, 11, 10, 15, 28, 52, 66, 56, 46, 46, 50, 52, 56, 64, 76, 92, 100, 94, 82, 76, 74, 72],
      saturday: [80, 70, 58, 44, 30, 18, 16, 20, 26, 32, 42, 52, 60, 66, 70, 72, 74, 78, 82, 84, 82, 80, 80, 84],
      sunday: [90, 80, 66, 50, 36, 22, 16, 16, 18, 24, 34, 44, 52, 58, 62, 64, 66, 70, 72, 70, 64, 56, 46, 36],
    },
    dayOfWeek: [86, 88, 90, 92, 100, 96, 78],
    monthFactor: [0.97, 0.95, 0.98, 1, 1.02, 1, 0.96, 0.93, 1.03, 1.05, 1.04, 1.07],
    zones: [
      {
        id: 'istanbul-havalimani',
        name: 'İstanbul Havalimanı',
        district: 'Arnavutköy',
        kind: 'havalimani',
        season: 'all',
        windows: [
          { days: [1, 2, 3, 4, 5, 6, 7], fromHour: 4, toHour: 10, intensity: 3 },
          { days: [1, 2, 3, 4, 5, 6, 7], fromHour: 17, toHour: 2, intensity: 2 },
          { days: [5, 7], fromHour: 14, toHour: 24, intensity: 3 },
        ],
        reason: 'Sabah ve akşam uçuş dalgaları; uzun mesafeli yolculuk',
      },
      {
        id: 'sabiha-gokcen-havalimani',
        name: 'Sabiha Gökçen Havalimanı',
        district: 'Pendik',
        kind: 'havalimani',
        season: 'all',
        windows: [
          { days: [1, 2, 3, 4, 5, 6, 7], fromHour: 22, toHour: 4, intensity: 3 },
          { days: [1, 2, 3, 4, 5, 6, 7], fromHour: 5, toHour: 10, intensity: 2 },
          { days: [5, 7], fromHour: 16, toHour: 24, intensity: 2 },
        ],
        reason: 'Metro gece yarısı kapanır; gece inişlerinde talep araca kalır',
      },
      {
        id: 'taksim-istiklal',
        name: 'Taksim – İstiklal',
        district: 'Beyoğlu',
        kind: 'eglence-gece',
        season: 'all',
        windows: [
          { days: [5, 6], fromHour: 22, toHour: 4, intensity: 3 },
          { days: [4], fromHour: 22, toHour: 2, intensity: 2 },
          { days: [1, 2, 3, 7], fromHour: 20, toHour: 24, intensity: 1 },
          { days: [6, 7], fromHour: 13, toHour: 20, intensity: 2 },
        ],
        reason: 'Hafta sonu gece çıkışları ve gündüz turist hareketi yoğun',
      },
      {
        id: 'kadikoy-carsi-moda',
        name: 'Kadıköy Çarşı – Moda',
        district: 'Kadıköy',
        kind: 'eglence-gece',
        season: 'all',
        windows: [
          { days: [5, 6], fromHour: 21, toHour: 3, intensity: 3 },
          { days: [1, 2, 3, 4, 7], fromHour: 19, toHour: 24, intensity: 1 },
          { days: [6, 7], fromHour: 12, toHour: 20, intensity: 2 },
        ],
        reason: 'Akşam ve hafta sonu gecesi çıkışlar; iskele aktarması',
      },
      {
        id: 'ortakoy-bebek-etiler',
        name: 'Ortaköy – Bebek – Etiler',
        district: 'Beşiktaş',
        kind: 'eglence-gece',
        season: 'all',
        windows: [
          { days: [5, 6], fromHour: 22, toHour: 4, intensity: 3 },
          { days: [4], fromHour: 21, toHour: 2, intensity: 2 },
          { days: [6, 7], fromHour: 12, toHour: 20, intensity: 2 },
        ],
        reason: 'Boğaz hattı: hafta sonu gece çıkışı ve gündüz gezisi',
      },
      {
        id: 'levent-maslak',
        name: 'Levent – Maslak',
        district: 'Beşiktaş / Sarıyer',
        kind: 'is-merkezi',
        season: 'all',
        windows: [
          { days: [1, 2, 3, 4, 5], fromHour: 7, toHour: 10, intensity: 2 },
          { days: [1, 2, 3, 4, 5], fromHour: 17, toHour: 21, intensity: 3 },
          { days: [1, 2, 3, 4, 5], fromHour: 12, toHour: 14, intensity: 1 },
        ],
        reason: 'Plaza bölgesi; hafta içi akşam iş çıkışı en yoğun an',
      },
      {
        id: 'mecidiyekoy-sisli',
        name: 'Mecidiyeköy – Şişli',
        district: 'Şişli',
        kind: 'is-merkezi',
        season: 'all',
        windows: [
          { days: [1, 2, 3, 4, 5], fromHour: 8, toHour: 10, intensity: 2 },
          { days: [1, 2, 3, 4, 5], fromHour: 17, toHour: 21, intensity: 3 },
          { days: [6], fromHour: 13, toHour: 21, intensity: 2 },
        ],
        reason: 'İş ve AVM bölgesi; akşam çıkışı ve cumartesi alışverişi',
      },
      {
        id: 'sultanahmet-eminonu',
        name: 'Sultanahmet – Eminönü',
        district: 'Fatih',
        kind: 'turistik',
        season: 'all',
        windows: [
          { days: [1, 2, 3, 4, 5, 6, 7], fromHour: 9, toHour: 19, intensity: 2 },
          { days: [1, 2, 3, 4, 5, 6, 7], fromHour: 19, toHour: 23, intensity: 1 },
        ],
        reason: 'Turist ve çarşı yoğunluğu gün boyu; yazın daha da artar',
      },
      {
        id: 'esenler-otogar',
        name: 'Esenler Otogarı',
        district: 'Bayrampaşa',
        kind: 'otogar-gar',
        season: 'all',
        windows: [
          { days: [1, 2, 3, 4, 5, 6, 7], fromHour: 5, toHour: 10, intensity: 2 },
          { days: [1, 7], fromHour: 5, toHour: 11, intensity: 3 },
          { days: [5, 7], fromHour: 17, toHour: 24, intensity: 2 },
        ],
        reason: 'Gece otobüsleriyle sabah erken varışlar; bayram dönüşü zirve',
      },
      {
        id: 'basaksehir-sehir-hastanesi',
        name: 'Başakşehir Şehir Hastanesi çevresi',
        district: 'Başakşehir',
        kind: 'hastane',
        season: 'all',
        windows: [
          { days: [1, 2, 3, 4, 5], fromHour: 7, toHour: 17, intensity: 2 },
          { days: [6, 7], fromHour: 10, toHour: 18, intensity: 1 },
        ],
        reason: 'Günde on binlerce hasta ve ziyaretçi; hafta içi gündüz',
      },
      {
        id: 'bakirkoy-merkez-sahil',
        name: 'Bakırköy Merkez – Sahil',
        district: 'Bakırköy',
        kind: 'alisveris',
        season: 'all',
        windows: [
          { days: [6, 7], fromHour: 12, toHour: 22, intensity: 2 },
          { days: [1, 2, 3, 4, 5], fromHour: 17, toHour: 21, intensity: 2 },
          { days: [5, 6], fromHour: 21, toHour: 1, intensity: 1 },
        ],
        reason: 'Çarşı, sahil ve AVM bölgesi; hafta sonu öğleden sonra',
      },
    ],
  },
  'Ankara': {
    hourly: {
      weekday: [22, 14, 10, 7, 7, 11, 24, 50, 72, 58, 42, 40, 46, 46, 44, 48, 58, 80, 88, 76, 56, 46, 38, 30],
      friday: [24, 16, 11, 8, 7, 11, 22, 48, 68, 56, 44, 44, 50, 50, 54, 64, 80, 96, 100, 88, 72, 66, 64, 62],
      saturday: [70, 60, 48, 36, 24, 14, 12, 16, 22, 28, 38, 48, 56, 62, 64, 66, 66, 68, 70, 72, 70, 68, 68, 72],
      sunday: [76, 66, 52, 38, 26, 16, 12, 12, 14, 20, 30, 40, 48, 52, 56, 60, 64, 68, 70, 66, 58, 50, 40, 30],
    },
    dayOfWeek: [88, 86, 88, 90, 100, 92, 72],
    monthFactor: [1.02, 1, 1.03, 1.02, 1.02, 0.95, 0.88, 0.87, 1.02, 1.07, 1.06, 1.06],
    zones: [
      {
        id: 'esenboga-havalimani',
        name: 'Esenboğa Havalimanı',
        district: 'Çubuk',
        kind: 'havalimani',
        season: 'all',
        windows: [
          { days: [1, 2, 3, 4, 5, 6, 7], fromHour: 5, toHour: 9, intensity: 2 },
          { days: [1, 2, 3, 4, 5, 6, 7], fromHour: 19, toHour: 1, intensity: 2 },
          { days: [5], fromHour: 15, toHour: 23, intensity: 3 },
          { days: [7], fromHour: 16, toHour: 24, intensity: 3 },
        ],
        reason: 'Merkeze yaklaşık 28 km; akşam inişleri ve pazar dönüşü',
      },
      {
        id: 'asti-otogar',
        name: 'AŞTİ Otogarı',
        district: 'Yenimahalle',
        kind: 'otogar-gar',
        season: 'all',
        windows: [
          { days: [1, 2, 3, 4, 5, 6, 7], fromHour: 5, toHour: 10, intensity: 2 },
          { days: [5], fromHour: 15, toHour: 24, intensity: 3 },
          { days: [7], fromHour: 14, toHour: 24, intensity: 3 },
          { days: [1, 2, 3, 4, 5, 6, 7], fromHour: 0, toHour: 5, intensity: 1 },
        ],
        reason: '7/24 hareketli; cuma çıkışı ve pazar dönüşü çok yoğun',
      },
      {
        id: 'ankara-yht-gari',
        name: 'Ankara YHT Garı',
        district: 'Altındağ',
        kind: 'otogar-gar',
        season: 'all',
        windows: [
          { days: [1, 2, 3, 4, 5, 6, 7], fromHour: 7, toHour: 10, intensity: 1 },
          { days: [1, 2, 3, 4, 5, 6, 7], fromHour: 17, toHour: 22, intensity: 2 },
          { days: [5], fromHour: 14, toHour: 22, intensity: 3 },
          { days: [7], fromHour: 15, toHour: 23, intensity: 3 },
        ],
        reason: 'Hızlı tren varışları; cuma ve pazar akşamı yoğun',
      },
      {
        id: 'kizilay',
        name: 'Kızılay',
        district: 'Çankaya',
        kind: 'is-merkezi',
        season: 'all',
        windows: [
          { days: [1, 2, 3, 4, 5], fromHour: 7, toHour: 10, intensity: 2 },
          { days: [1, 2, 3, 4, 5], fromHour: 17, toHour: 20, intensity: 3 },
          { days: [5, 6], fromHour: 22, toHour: 5, intensity: 3 },
          { days: [1, 2, 3, 4, 7], fromHour: 21, toHour: 1, intensity: 1 },
        ],
        reason: 'Şehir merkezi; mesai çıkışı ve hafta sonu sabaha kadar gece hayatı',
      },
      {
        id: 'tunali-kavaklidere',
        name: 'Tunalı Hilmi – Kavaklıdere',
        district: 'Çankaya',
        kind: 'eglence-gece',
        season: 'all',
        windows: [
          { days: [5, 6], fromHour: 21, toHour: 3, intensity: 3 },
          { days: [3, 4], fromHour: 20, toHour: 1, intensity: 1 },
          { days: [6, 7], fromHour: 12, toHour: 19, intensity: 2 },
        ],
        reason: 'Gündüz cadde alışverişi, hafta sonu gecesi çıkışlar',
      },
      {
        id: 'bahcelievler-7-cadde',
        name: 'Bahçelievler 7. Cadde',
        district: 'Çankaya',
        kind: 'eglence-gece',
        season: 'all',
        windows: [
          { days: [5, 6], fromHour: 21, toHour: 4, intensity: 3 },
          { days: [1, 2, 3, 4, 7], fromHour: 19, toHour: 1, intensity: 1 },
        ],
        reason: 'Öğrenci ağırlıklı kafe-bar hattı; hafta sonu gece geç saate kadar',
      },
      {
        id: 'sogutozu-cukurambar',
        name: 'Söğütözü – Çukurambar',
        district: 'Çankaya',
        kind: 'is-merkezi',
        season: 'all',
        windows: [
          { days: [1, 2, 3, 4, 5], fromHour: 7, toHour: 10, intensity: 2 },
          { days: [1, 2, 3, 4, 5], fromHour: 17, toHour: 19, intensity: 3 },
          { days: [5, 6], fromHour: 20, toHour: 2, intensity: 2 },
        ],
        reason: 'Plazalar mesai bitince boşalır; cuma-cumartesi akşamı restoranlar',
      },
      {
        id: 'odtu-beytepe-kampusleri',
        name: 'ODTÜ – Hacettepe Beytepe kampüsleri',
        district: 'Çankaya',
        kind: 'universite',
        season: 'school-term',
        windows: [
          { days: [1, 2, 3, 4, 5], fromHour: 8, toHour: 10, intensity: 2 },
          { days: [1, 2, 3, 4, 5], fromHour: 16, toHour: 20, intensity: 2 },
          { days: [5], fromHour: 14, toHour: 19, intensity: 2 },
          { days: [7], fromHour: 17, toHour: 23, intensity: 2 },
        ],
        reason: 'Dönem içi kampüs giriş-çıkışı; pazar akşamı yurda dönüş',
      },
      {
        id: 'ankara-sehir-hastanesi',
        name: 'Ankara Şehir Hastanesi çevresi',
        district: 'Çankaya',
        kind: 'hastane',
        season: 'all',
        windows: [
          { days: [1, 2, 3, 4, 5], fromHour: 7, toHour: 17, intensity: 2 },
          { days: [6, 7], fromHour: 10, toHour: 18, intensity: 1 },
        ],
        reason: 'Çok büyük hastane yerleşkesi; hafta içi gündüz sürekli hareket',
      },
      {
        id: 'etlik-sehir-hastanesi',
        name: 'Etlik Şehir Hastanesi çevresi',
        district: 'Yenimahalle',
        kind: 'hastane',
        season: 'all',
        windows: [
          { days: [1, 2, 3, 4, 5], fromHour: 7, toHour: 17, intensity: 2 },
          { days: [6, 7], fromHour: 10, toHour: 18, intensity: 1 },
        ],
        reason: 'Günde yaklaşık 25 bin poliklinik hastası; hafta içi gündüz',
      },
      {
        id: 'ulus-hamamonu',
        name: 'Ulus – Hamamönü',
        district: 'Altındağ',
        kind: 'turistik',
        season: 'all',
        windows: [
          { days: [6, 7], fromHour: 10, toHour: 19, intensity: 2 },
          { days: [1, 2, 3, 4, 5], fromHour: 10, toHour: 17, intensity: 1 },
        ],
        reason: 'Tarihi çarşı ve gezi alanı; hafta sonu gündüz hareketli',
      },
      {
        id: 'cayyolu-umitkoy',
        name: 'Çayyolu – Ümitköy',
        district: 'Çankaya',
        kind: 'konut-yogun',
        season: 'all',
        windows: [
          { days: [1, 2, 3, 4, 5], fromHour: 7, toHour: 9, intensity: 2 },
          { days: [1, 2, 3, 4, 5], fromHour: 18, toHour: 21, intensity: 2 },
          { days: [5, 6], fromHour: 21, toHour: 1, intensity: 1 },
        ],
        reason: 'Uydu konut bölgesi; sabah merkeze, akşam eve dönüş',
      },
    ],
  },
  'İzmir': {
    hourly: {
      weekday: [16, 10, 7, 5, 5, 9, 22, 50, 68, 56, 45, 45, 49, 49, 50, 54, 63, 78, 84, 72, 58, 50, 42, 28],
      friday: [20, 13, 8, 6, 6, 10, 22, 48, 66, 55, 45, 47, 54, 52, 55, 62, 74, 90, 100, 92, 80, 74, 72, 68],
      saturday: [66, 58, 44, 31, 19, 12, 13, 19, 27, 34, 42, 50, 56, 60, 62, 64, 66, 70, 74, 78, 80, 84, 88, 86],
      sunday: [84, 76, 60, 44, 27, 14, 9, 11, 15, 22, 32, 42, 50, 54, 56, 58, 62, 66, 68, 64, 56, 46, 34, 22],
    },
    dayOfWeek: [76, 77, 79, 83, 96, 100, 81],
    monthFactor: [0.95, 0.93, 0.97, 1, 1.03, 1.02, 1, 1, 1.05, 1.03, 0.98, 1.04],
    zones: [
      {
        id: 'izmir-adnan-menderes-havalimani',
        name: 'Adnan Menderes Havalimanı',
        district: 'Gaziemir',
        kind: 'havalimani',
        season: 'all',
        windows: [
          { days: [1, 2, 3, 4, 5, 6, 7], fromHour: 5, toHour: 9, intensity: 2 },
          { days: [1, 2, 3, 4, 5, 6, 7], fromHour: 22, toHour: 2, intensity: 2 },
          { days: [5, 7], fromHour: 16, toHour: 22, intensity: 3 },
        ],
        reason: 'Sabah erken kalkışlar ve gece inişleri; cuma ve pazar akşamı zirve',
      },
      {
        id: 'izmir-otogar',
        name: 'İzmir Otogarı',
        district: 'Bornova',
        kind: 'otogar-gar',
        season: 'all',
        windows: [
          { days: [1, 2, 3, 4, 5, 6, 7], fromHour: 6, toHour: 10, intensity: 2 },
          { days: [5], fromHour: 16, toHour: 23, intensity: 2 },
          { days: [7], fromHour: 15, toHour: 24, intensity: 3 },
        ],
        reason: 'Sabah gelen otobüsler, cuma çıkış ve pazar dönüş yoğunluğu',
      },
      {
        id: 'izmir-alsancak',
        name: 'Alsancak',
        district: 'Konak',
        kind: 'eglence-gece',
        season: 'all',
        windows: [
          { days: [1, 2, 3, 4], fromHour: 19, toHour: 24, intensity: 1 },
          { days: [5, 6], fromHour: 20, toHour: 4, intensity: 3 },
          { days: [7], fromHour: 17, toHour: 23, intensity: 1 },
        ],
        reason: 'Bar ve restoran merkezi; cuma-cumartesi gece çıkışı çok yoğun',
      },
      {
        id: 'izmir-konak-kemeralti',
        name: 'Konak Meydanı – Kemeraltı',
        district: 'Konak',
        kind: 'alisveris',
        season: 'all',
        windows: [
          { days: [1, 2, 3, 4, 5], fromHour: 10, toHour: 19, intensity: 2 },
          { days: [6], fromHour: 10, toHour: 19, intensity: 3 },
        ],
        reason: 'Tarihi çarşı ve resmi daireler; gündüz ve cumartesi yoğun',
      },
      {
        id: 'izmir-bayrakli-is-merkezi',
        name: 'Bayraklı iş merkezi',
        district: 'Bayraklı',
        kind: 'is-merkezi',
        season: 'all',
        windows: [
          { days: [1, 2, 3, 4, 5], fromHour: 7, toHour: 10, intensity: 2 },
          { days: [1, 2, 3, 4, 5], fromHour: 17, toHour: 20, intensity: 3 },
        ],
        reason: 'Plaza bölgesi; sabah giriş ve akşam çıkış saatlerinde talep',
      },
      {
        id: 'izmir-bayrakli-sehir-hastanesi',
        name: 'Bayraklı Şehir Hastanesi',
        district: 'Bayraklı',
        kind: 'hastane',
        season: 'all',
        windows: [
          { days: [1, 2, 3, 4, 5], fromHour: 8, toHour: 12, intensity: 2 },
          { days: [1, 2, 3, 4, 5], fromHour: 13, toHour: 18, intensity: 2 },
          { days: [6, 7], fromHour: 11, toHour: 17, intensity: 1 },
        ],
        reason: 'Günde binlerce poliklinik hastası; hafta içi gündüz yoğun',
      },
      {
        id: 'izmir-bornova-ege-kucukpark',
        name: 'Bornova (Ege Üniversitesi – Küçükpark)',
        district: 'Bornova',
        kind: 'universite',
        season: 'school-term',
        windows: [
          { days: [1, 2, 3, 4, 5], fromHour: 8, toHour: 10, intensity: 2 },
          { days: [1, 2, 3, 4, 5], fromHour: 16, toHour: 19, intensity: 2 },
          { days: [4, 5, 6], fromHour: 21, toHour: 3, intensity: 2 },
        ],
        reason: 'Kampüs giriş-çıkışı ve öğrenci gece hayatı (Küçükpark)',
      },
      {
        id: 'izmir-karsiyaka-bostanli',
        name: 'Karşıyaka Çarşı – Bostanlı',
        district: 'Karşıyaka',
        kind: 'sahil',
        season: 'all',
        windows: [
          { days: [1, 2, 3, 4], fromHour: 18, toHour: 23, intensity: 1 },
          { days: [5, 6], fromHour: 19, toHour: 2, intensity: 2 },
          { days: [7], fromHour: 12, toHour: 22, intensity: 2 },
        ],
        reason: 'Sahil, çarşı ve iskele; akşam ve hafta sonu hareketli',
      },
      {
        id: 'izmir-cesme-alacati',
        name: 'Çeşme – Alaçatı',
        district: 'Çeşme',
        kind: 'turistik',
        season: 'summer',
        windows: [
          { days: [1, 2, 3, 4], fromHour: 21, toHour: 3, intensity: 2 },
          { days: [5, 6], fromHour: 22, toHour: 5, intensity: 3 },
          { days: [7], fromHour: 15, toHour: 23, intensity: 2 },
        ],
        reason: 'Yaz gece eğlencesi; hafta sonu ve bayramda nüfus katlanır',
      },
      {
        id: 'izmir-balcova-inciralti',
        name: 'Balçova AVM bölgesi – İnciraltı',
        district: 'Balçova',
        kind: 'alisveris',
        season: 'all',
        windows: [
          { days: [1, 2, 3, 4, 5], fromHour: 8, toHour: 16, intensity: 1 },
          { days: [1, 2, 3, 4, 5], fromHour: 17, toHour: 21, intensity: 1 },
          { days: [6, 7], fromHour: 12, toHour: 21, intensity: 2 },
        ],
        reason: 'AVM ve üniversite hastanesi; hafta sonu öğleden sonra yoğun',
      },
      {
        id: 'izmir-kulturpark',
        name: 'Kültürpark',
        district: 'Konak',
        kind: 'etkinlik',
        season: 'summer',
        windows: [
          { days: [1, 2, 3, 4], fromHour: 21, toHour: 1, intensity: 1 },
          { days: [5, 6, 7], fromHour: 21, toHour: 1, intensity: 2 },
        ],
        reason: 'Açık hava konserleri; eylül başında uluslararası fuar',
      },
      {
        id: 'izmir-buca-tinaztepe',
        name: 'Buca – Tınaztepe Kampüsü',
        district: 'Buca',
        kind: 'universite',
        season: 'school-term',
        windows: [
          { days: [1, 2, 3, 4, 5], fromHour: 8, toHour: 10, intensity: 1 },
          { days: [1, 2, 3, 4, 5], fromHour: 15, toHour: 19, intensity: 2 },
        ],
        reason: 'Kampüs çıkışı ve Buca konut bölgesine dönüş',
      },
    ],
  },
  'Antalya': {
    hourly: {
      weekday: [30, 22, 16, 14, 15, 20, 28, 44, 54, 48, 44, 44, 46, 46, 46, 50, 56, 64, 70, 68, 64, 60, 54, 42],
      friday: [32, 24, 17, 15, 16, 20, 28, 44, 53, 48, 44, 46, 50, 49, 50, 54, 62, 74, 82, 82, 80, 80, 78, 72],
      saturday: [70, 62, 48, 36, 28, 22, 22, 26, 32, 40, 48, 56, 62, 64, 64, 66, 70, 76, 82, 88, 92, 96, 100, 94],
      sunday: [88, 80, 64, 48, 34, 26, 22, 22, 26, 32, 42, 52, 58, 62, 64, 66, 70, 74, 74, 70, 64, 56, 46, 34],
    },
    dayOfWeek: [72, 71, 73, 77, 86, 100, 88],
    monthFactor: [0.72, 0.72, 0.8, 0.92, 1.06, 1.2, 1.28, 1.3, 1.2, 1.08, 0.86, 0.86],
    zones: [
      {
        id: 'antalya-havalimani',
        name: 'Antalya Havalimanı',
        district: 'Muratpaşa',
        kind: 'havalimani',
        season: 'all',
        windows: [
          { days: [1, 2, 3, 4, 5, 6, 7], fromHour: 0, toHour: 4, intensity: 2 },
          { days: [1, 2, 3, 4, 5, 6, 7], fromHour: 5, toHour: 10, intensity: 3 },
          { days: [1, 2, 3, 4, 5, 6, 7], fromHour: 14, toHour: 20, intensity: 2 },
        ],
        reason: 'Tatil uçuşları; sabah erken ve gece geç saatlerde yoğun',
      },
      {
        id: 'antalya-otogar',
        name: 'Antalya Otogarı',
        district: 'Kepez',
        kind: 'otogar-gar',
        season: 'all',
        windows: [
          { days: [1, 2, 3, 4, 5, 6, 7], fromHour: 6, toHour: 10, intensity: 2 },
          { days: [5], fromHour: 16, toHour: 23, intensity: 2 },
          { days: [7], fromHour: 14, toHour: 24, intensity: 3 },
        ],
        reason: 'Sabah gelen otobüsler, pazar akşamı dönüş yoğunluğu',
      },
      {
        id: 'antalya-kaleici',
        name: 'Kaleiçi – Kalekapısı',
        district: 'Muratpaşa',
        kind: 'turistik',
        season: 'all',
        windows: [
          { days: [1, 2, 3, 4, 7], fromHour: 19, toHour: 1, intensity: 2 },
          { days: [5, 6], fromHour: 20, toHour: 3, intensity: 3 },
        ],
        reason: 'Tarihi merkez; akşam yemeği ve gece çıkışı, turist yoğun',
      },
      {
        id: 'antalya-konyaalti-sahili',
        name: 'Konyaaltı Sahili',
        district: 'Konyaaltı',
        kind: 'sahil',
        season: 'summer',
        windows: [
          { days: [6, 7], fromHour: 10, toHour: 14, intensity: 1 },
          { days: [1, 2, 3, 4, 7], fromHour: 18, toHour: 1, intensity: 2 },
          { days: [5, 6], fromHour: 19, toHour: 3, intensity: 3 },
        ],
        reason: 'Plaj ve sahil mekânları; yaz akşamları ve gece hareketli',
      },
      {
        id: 'antalya-lara-sirinyali',
        name: 'Lara – Şirinyalı',
        district: 'Muratpaşa',
        kind: 'eglence-gece',
        season: 'all',
        windows: [
          { days: [1, 2, 3, 4], fromHour: 19, toHour: 24, intensity: 1 },
          { days: [5, 6], fromHour: 20, toHour: 2, intensity: 2 },
          { days: [7], fromHour: 17, toHour: 23, intensity: 1 },
        ],
        reason: 'Restoran ve kafe aksı; gece yarısına kadar hareketli',
      },
      {
        id: 'antalya-kundu',
        name: 'Kundu (Lara otelleri)',
        district: 'Aksu',
        kind: 'turistik',
        season: 'summer',
        windows: [
          { days: [1, 2, 3, 4, 5, 6, 7], fromHour: 8, toHour: 12, intensity: 2 },
          { days: [1, 2, 3, 4, 5, 6, 7], fromHour: 19, toHour: 24, intensity: 1 },
        ],
        reason: 'Büyük oteller; havalimanı ve şehir merkezi yolculukları',
      },
      {
        id: 'antalya-belek',
        name: 'Belek',
        district: 'Serik',
        kind: 'turistik',
        season: 'summer',
        windows: [
          { days: [1, 2, 3, 4, 5, 6, 7], fromHour: 8, toHour: 12, intensity: 1 },
          { days: [1, 2, 3, 4, 5, 6, 7], fromHour: 18, toHour: 23, intensity: 1 },
        ],
        reason: 'Otel ve golf bölgesi; uzun mesafeli havalimanı yolculukları',
      },
      {
        id: 'antalya-meltem-universite-hastane',
        name: 'Akdeniz Üniversitesi – Meltem hastaneleri',
        district: 'Konyaaltı / Muratpaşa',
        kind: 'hastane',
        season: 'all',
        windows: [
          { days: [1, 2, 3, 4, 5], fromHour: 8, toHour: 12, intensity: 2 },
          { days: [1, 2, 3, 4, 5], fromHour: 13, toHour: 18, intensity: 2 },
        ],
        reason: 'Üniversite kampüsü ve büyük hastaneler; hafta içi gündüz',
      },
      {
        id: 'antalya-merkez-avm',
        name: 'Işıklar – Muratpaşa AVM bölgesi',
        district: 'Muratpaşa',
        kind: 'alisveris',
        season: 'all',
        windows: [
          { days: [1, 2, 3, 4, 5], fromHour: 17, toHour: 21, intensity: 1 },
          { days: [6, 7], fromHour: 12, toHour: 21, intensity: 2 },
        ],
        reason: 'Şehir merkezi çarşı ve AVM; akşam ve hafta sonu hareketli',
      },
      {
        id: 'antalya-alanya',
        name: 'Alanya merkez – sahil',
        district: 'Alanya',
        kind: 'turistik',
        season: 'summer',
        windows: [
          { days: [1, 2, 3, 4, 7], fromHour: 20, toHour: 2, intensity: 2 },
          { days: [5, 6], fromHour: 20, toHour: 4, intensity: 3 },
        ],
        reason: 'Yaz turizmi ve gece hayatı; Antalya merkezine uzak, ayrı pazar',
      },
      {
        id: 'antalya-kemer',
        name: 'Kemer',
        district: 'Kemer',
        kind: 'turistik',
        season: 'summer',
        windows: [
          { days: [1, 2, 3, 4, 5, 6, 7], fromHour: 21, toHour: 3, intensity: 1 },
        ],
        reason: 'Tatil beldesi; gece eğlencesi ve otel yolculukları',
      },
    ],
  },
};
