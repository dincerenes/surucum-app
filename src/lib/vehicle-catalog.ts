/**
 * Araç markaları ve modelleri — kurulumda listeden seçmek için.
 *
 * KAPSAM: Türkiye'de ticari amaçla en sık kullanılan binek araçlar ve
 * kuryelerin motosiklet/scooter'ları. Eksiksiz bir tescil kaydı değil,
 * KOLAYLIK listesi. Listede olmayan araç için her iki alanda da serbest
 * giriş var; hiçbir sürücü listeye takılıp kurulumu bırakamamalı.
 *
 * Model adları Türkiye Sigorta Birliği'nin Kasko Değer Listesi'nden
 * (Ekim 2026) kontrol edildi; liste oradan elle seçildi, tamamı alınmadı.
 * İlk 49 kullanıcının %36'sı aracını listede bulamayıp elle yazmıştı
 * (13 Ekim 2026) — en çok Hyundai Accent Era ve motosikletler.
 *
 * NOT — buradaki marka adları ARAÇ ÜRETİCİLERİ. Marka adı yasağı
 * sürücünün üzerinden çalıştığı platformlar içindir; aracın markası
 * ürünün kendi verisi ve raporlarda araca göre karşılaştırma yapmanın
 * tek yolu.
 *
 * Modeller alfabetik değil, YAYGINLIK sırasında: sürücü aradığını
 * çoğu zaman ilk üç satırda buluyor ve aramaya hiç gerek kalmıyor.
 * Eski kayıtlarda geçen adlar (ör. Ford "Courier") korunmalı: listeden
 * düşen ad, düzenleme ekranında seçili değer olarak görünmez olur.
 */

export const OTHER_OPTION = 'Diğer';

export type VehicleKind = 'car' | 'motorcycle';

/** Kurulum ve düzenleme ekranındaki tür anahtarı — varsayılan otomobil. */
export const VEHICLE_KIND_OPTIONS: readonly { key: VehicleKind; label: string }[] = [
  { key: 'car', label: 'Otomobil' },
  { key: 'motorcycle', label: 'Motosiklet' },
];

const CARS: Readonly<Record<string, readonly string[]>> = {
  Renault: [
    'Symbol', 'Clio', 'Megane', 'Fluence', 'Taliant', 'Captur', 'Kangoo', 'Talisman',
    'Austral', 'Kadjar', 'Laguna', 'Latitude', 'Scenic', 'Koleos', 'Trafic',
  ],
  Fiat: [
    'Egea', 'Egea Cross', 'Linea', 'Doblo', 'Fiorino', 'Punto', 'Albea',
    'Grande Punto', 'Palio', 'Bravo', 'Panda', '500', '500L', '500X', 'Scudo', 'Ducato',
  ],
  Volkswagen: [
    'Passat', 'Golf', 'Polo', 'Jetta', 'Caddy', 'Transporter', 'T-Roc',
    'Tiguan', 'Touran', 'Caravelle', 'T-Cross', 'Taigo', 'Arteon', 'Scirocco', 'Amarok',
  ],
  Toyota: [
    'Corolla', 'Corolla Cross', 'Yaris', 'C-HR', 'Auris', 'Avensis',
    'Yaris Cross', 'RAV4', 'Camry', 'Verso', 'Prius', 'Proace City', 'Hilux',
  ],
  Hyundai: [
    'i20', 'Accent Era', 'Accent Blue', 'i10', 'i30', 'Elantra', 'Bayon', 'Tucson',
    'Kona', 'Getz', 'Accent', 'ix35', 'Santa Fe', 'IONIQ', 'Matrix', 'H-1', 'Staria',
  ],
  Ford: [
    'Focus', 'Fiesta', 'Mondeo', 'Courier', 'Connect', 'Custom', 'Puma',
    'Kuga', 'C-Max', 'Fusion', 'Ka', 'EcoSport', 'Transit', 'Ranger', 'S-Max',
  ],
  Honda: ['Civic', 'City', 'Jazz', 'CR-V', 'HR-V', 'Accord', 'ZR-V'],
  Opel: [
    'Astra', 'Corsa', 'Insignia', 'Combo', 'Grandland',
    'Mokka', 'Crossland', 'Zafira', 'Meriva', 'Vectra', 'Vivaro',
  ],
  Peugeot: [
    '301', '208', '308', '2008', '3008', 'Partner',
    'Rifter', '508', '5008', '207', '206', '307', '407', '408', 'Expert', 'Bipper',
  ],
  Citroen: [
    'C-Elysee', 'C3', 'C4', 'Berlingo',
    'C4 X', 'C3 Aircross', 'C5 Aircross', 'C4 Picasso', 'C5', 'C1', 'Nemo', 'Jumpy',
  ],
  Dacia: ['Sandero', 'Duster', 'Logan', 'Jogger', 'Lodgy', 'Dokker', 'Spring'],
  Skoda: [
    'Octavia', 'Superb', 'Fabia', 'Scala', 'Kamiq',
    'Karoq', 'Kodiaq', 'Rapid', 'Yeti', 'Enyaq',
  ],
  Nissan: ['Qashqai', 'Micra', 'Juke', 'Note', 'X-Trail', 'Almera', 'Navara', 'Leaf'],
  Kia: [
    'Cerato', 'Rio', 'Sportage', 'Ceed', 'Stonic',
    'Picanto', 'XCeed', 'Niro', 'Sorento', 'Venga', 'Soul',
  ],
  Seat: ['Leon', 'Ibiza', 'Toledo', 'Arona', 'Ateca', 'Altea', 'Cordoba'],
  Mercedes: [
    'C Serisi', 'E Serisi', 'Vito', 'Sprinter', 'A Serisi',
    'B Serisi', 'CLA', 'GLA', 'GLC', 'S Serisi', 'V Serisi', 'Citan',
  ],
  BMW: [
    '3 Serisi', '5 Serisi', '1 Serisi', '2 Serisi Tourer',
    '2 Serisi', '4 Serisi', '7 Serisi', 'X1', 'X3', 'X5',
  ],
  Audi: ['A3', 'A4', 'A6', 'Q3', 'A1', 'A5', 'Q2', 'Q5', 'Q7', 'A8'],
  Chevrolet: ['Aveo', 'Cruze', 'Lacetti', 'Spark', 'Captiva', 'Kalos', 'Epica', 'Trax'],
  Mitsubishi: ['Lancer', 'ASX', 'Space Star', 'Colt', 'L200', 'Outlander', 'Eclipse Cross'],
  Suzuki: ['Swift', 'Vitara', 'SX4', 'Grand Vitara', 'Jimny', 'Splash', 'Baleno', 'S-Cross'],
  Volvo: ['S60', 'V40', 'XC40', 'S40', 'S80', 'S90', 'V60', 'XC60', 'XC90'],
  Togg: ['T10X', 'T10F'],
  Tesla: ['Model 3', 'Model Y'],
  MG: ['MG4', 'ZS', 'MG5', 'HS', 'MG3'],
  Chery: ['Tiggo 7', 'Tiggo 8', 'Omoda 5'],
  BYD: ['Seal', 'Atto 3', 'Dolphin', 'Seal U'],
  Mazda: ['3', '6', '2', 'CX-3', 'CX-5'],
  Cupra: ['Formentor', 'Leon', 'Born', 'Terramar'],
  'Alfa Romeo': ['Giulietta', 'Giulia', 'MiTo', 'Tonale', '159'],
  SsangYong: ['Korando', 'Tivoli', 'Rexton', 'Actyon', 'Torres'],
  Jeep: ['Renegade', 'Compass', 'Grand Cherokee', 'Wrangler'],
  Mini: ['Cooper', 'Countryman', 'Clubman'],
  'Land Rover': ['Range Rover Evoque', 'Range Rover Sport', 'Discovery', 'Defender', 'Freelander'],
  Subaru: ['Forester', 'XV', 'Impreza', 'Outback', 'Legacy'],
  DS: ['DS 3', 'DS 4', 'DS 7'],
  Lexus: ['NX', 'RX', 'IS', 'ES', 'CT'],
  Tata: ['Manza', 'Indica', 'Indigo', 'Vista'],
  Lada: ['Vesta', 'Niva', 'Priora', 'Kalina'],
  Proton: ['Gen-2', 'Saga', 'Savvy', 'Waja'],
};

/**
 * Motosiklet ve scooter — kuryelerin en çok kullandıkları önce. Honda ve
 * Suzuki iki listede de var; hangisinde olduğu sürücünün seçtiği türden
 * belli.
 */
const MOTORCYCLES: Readonly<Record<string, readonly string[]>> = {
  Honda: ['PCX', 'Activa', 'Dio', 'SH', 'Forza', 'ADV350', 'X-ADV', 'CB125F', 'CB', 'CBR', 'NC 750X', 'Africa Twin'],
  Yamaha: ['NMAX', 'XMAX', 'TMAX', 'Tricity', 'Delight', 'Crypton', 'YBR', 'MT', 'YZF-R', 'Tracer'],
  Kuba: ['Superlight', 'Cita', 'Trendy', 'Pollo', 'Bellina', 'Rubano', 'Raden', 'Pikap', 'XR', 'Blackcat'],
  Mondial: ['Drift L', 'Lavinia', 'Superboy', 'Strada', 'Fury', 'Velomax', 'X-Treme', 'Touring', 'Ressivo'],
  Yuki: ['Gelato', 'Risotto', 'Crypto', 'Imola', 'Tekken', 'Lupo', 'Route', 'Driver', 'Voge'],
  RKS: ['K-Light', 'Superlight', 'Spontini', 'Vieste', 'Precio', 'Lince', 'Neon', 'Arome', 'RZ', 'SRK', 'Titanic'],
  Arora: ['Cappucino', 'Beatrix', 'Mojito', 'Malibu', 'Bravo', 'Quantum', 'Safari', 'Max', 'Jaguar', 'Polo'],
  Motolux: ['Macchiato', 'Americano', 'Cortado', 'Rossi', 'Vegas', 'Transit', 'Cargo'],
  Bajaj: ['Pulsar', 'Dominar', 'Discover', 'Boxer', 'Avenger'],
  TVS: ['Jupiter', 'NTORQ', 'Apache', 'Raider', 'Callisto', 'Ronin'],
  Kymco: ['Agility', 'People', 'X-Town', 'Downtown', 'Xciting', 'Like'],
  Sym: ['Jet', 'Fiddle', 'Symphony', 'Joymax', 'Orbit', 'Maxsym', 'Cruisym'],
  Vespa: ['Primavera', 'Sprint', 'GTS', 'GTV', 'LX'],
  Piaggio: ['Liberty', 'Medley', 'Beverly', 'MP3'],
  Suzuki: ['Burgman', 'Address', 'GSX', 'V-Strom'],
  CFMoto: ['250NK', '450', '700', '800'],
  Kawasaki: ['Ninja', 'Z', 'Versys', 'Vulcan'],
};

const CATALOGS: Readonly<Record<VehicleKind, Readonly<Record<string, readonly string[]>>>> = {
  car: CARS,
  motorcycle: MOTORCYCLES,
};

/** Otomobil markaları — yaygınlık sırasında, sonda "Diğer". */
export const VEHICLE_MAKES: readonly string[] = [...Object.keys(CARS), OTHER_OPTION];

/** Türün markaları — yaygınlık sırasında, sonda "Diğer". */
export function makesFor(kind: VehicleKind): readonly string[] {
  return [...Object.keys(CATALOGS[kind]), OTHER_OPTION];
}

/** Seçilen markanın modelleri. Bilinmeyen markada yalnızca "Diğer". */
export function modelsFor(make: string | null, kind: VehicleKind = 'car'): readonly string[] {
  if (!make) return [];
  const models = CATALOGS[kind][make];
  return models ? [...models, OTHER_OPTION] : [OTHER_OPTION];
}

/**
 * Kayıtlı bir aracın türü — düzenleme ekranı doğru listeyle açılsın.
 * Yalnızca motosiklet listesinde olan marka ya da motosiklet modeli
 * motosiklettir; geri kalan her şey (bilinmeyen dahil) otomobil.
 */
export function kindOf(make: string | null | undefined, model?: string | null): VehicleKind {
  if (!make) return 'car';
  const motoModels = MOTORCYCLES[make];
  if (!motoModels) return 'car';
  if (!CARS[make]) return 'motorcycle';
  return model != null && motoModels.includes(model) ? 'motorcycle' : 'car';
}

/**
 * Model yılı listesi — yeniden eskiye.
 *
 * Bu yıldan başlıyor. Önceden bir sonraki yıldan başlıyordu (sıfır araç
 * alanlar için), ama ilk hafta üç sürücü listenin tepesindeki yılları
 * yanlışlıkla seçti (2012 Accent Era "2026" kaydedildi). Bu yıl listede
 * kalıyor: sıfır aracı olan sürücü kendi yılını bulabilmeli. Yıl hiçbir
 * hesaba girmiyor, yalnızca araç adında görünüyor.
 */
export function modelYears(now: Date = new Date()): readonly string[] {
  const newest = now.getFullYear();
  const oldest = 1998;
  const years: string[] = [];
  for (let y = newest; y >= oldest; y--) years.push(String(y));
  return years;
}
