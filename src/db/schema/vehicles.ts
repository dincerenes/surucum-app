import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import {
  DEFAULT_WEAR_PER_KM, FUEL_TYPES, OWNERSHIP_TYPES, TRANSMISSION_TYPES, kurus, syncColumns,
} from './_shared';

/**
 * Araç. Sürücü araç değiştirdiğinde geçmiş raporlar bozulmasın diye
 * kayıt silinmez, `isActive` ile pasifleşir.
 */
export const vehicles = sqliteTable(
  'vehicles',
  {
    ...syncColumns,

    /** Kullanıcının verdiği ad. Plaka girmek istemeyebilir. */
    label: text().notNull(),
    plate: text(),

    make: text(),
    model: text(),
    modelYear: integer(),

    ownership: text({ enum: OWNERSHIP_TYPES }).notNull().default('owned'),

    /** Aracın devraldığı andaki kilometre — ilk yakıt hesabının referansı. */
    initialOdometerKm: integer(),

    /**
     * Kilometre başına yıpranma payı, kuruş — amortisman, lastik, bakım.
     * Araç oluşturulurken sahiplik biçimine göre atanır; kullanıcıya
     * sorulmaz ve arayüzde düzenlenmez (bkz. `_shared.ts`).
     *
     * Sütun olarak duruyor, koda gömülü sabit olarak değil: varsayılanı
     * ilerde güncellersek mevcut araçların geçmiş raporları kaymasın.
     */
    wearPerKmKurus: kurus().notNull().default(DEFAULT_WEAR_PER_KM.owned),

    transmission: text({ enum: TRANSMISSION_TYPES }),

    /**
     * Yıpranma payının GİRDİLERİ — kurulumda sürücüye soruluyor ve
     * `wearPerKmKurus` bunlardan hesaplanıyor (bkz. `lib/wear.ts`).
     * Hepsi boş olabilir: bilmeyen sürücü atlıyor, o kalemin payı
     * varsayılandan geliyor. Katsayı ayrıca SAKLANIYOR, her okumada
     * yeniden hesaplanmıyor: formül ileride değişirse geçmiş kaymasın.
     */
    maintenanceIntervalKm: integer(),
    maintenanceCostKurus: kurus(),
    tireIntervalKm: integer(),
    tireCostKurus: kurus(),
    /** İkinci el piyasa değeri — değer kaybı payı bundan. */
    marketValueKurus: kurus(),
    /** Hasar kaydı var mı? `null`: sorulmadı. Şimdilik hesaba girmiyor. */
    hasAccidentRecord: integer({ mode: 'boolean' }),

    isActive: integer({ mode: 'boolean' }).notNull().default(true),
    sortOrder: integer().notNull().default(0),
    notes: text(),
  },
  (t) => [index('vehicles_user_idx').on(t.userId, t.isActive)],
);

/**
 * Aracın kullandığı yakıt tipleri — ayrı tablo olmasının sebebi dönüşümlü
 * LPG araçlar: aynı araç hem benzin hem LPG yakıyor ve ikisinin tüketimi,
 * fiyatı, hatta deposu farklı.
 */
export const vehicleFuelTypes = sqliteTable(
  'vehicle_fuel_types',
  {
    ...syncColumns,

    vehicleId: text().notNull(),
    fuelType: text({ enum: FUEL_TYPES }).notNull(),

    /**
     * 100 km başına ortalama tüketim. Sıvı/gaz yakıtta MİLİLİTRE,
     * elektrikte WATT-SAAT. Tam sayı — kayan nokta yok.
     * Örnek: 7,5 lt/100km → 7500
     *
     * Kullanıcı elle girmek zorunda değil: tam depo kayıtları biriktikçe
     * bu değer gerçek tüketimden otomatik güncellenir.
     */
    /**
     * Sütun adı ELLE VERİLMİŞ, drizzle'ın casing'ine bırakılmamış.
     * Otomatik dönüşüm `avg_consumption_per100_km` üretiyor, buluttaki ad
     * ise `avg_consumption_per_100km`. Aradaki fark senkronda PostgREST
     * tarafından "bilinmeyen sütun" olarak reddedilirdi ve bu tablo hiç
     * senkronlanmazdı. İki taraf birebir aynı olmak zorunda.
     */
    avgConsumptionPer100Km: integer('avg_consumption_per_100km'),

    /** Bu değerin ölçülen dolumlardan mı geldiği, yoksa elle mi girildiği. */
    isConsumptionMeasured: integer({ mode: 'boolean' }).notNull().default(false),

    /** Bilinen son birim fiyat — çevrimdışıyken tahmini maliyet için. */
    lastUnitPriceKurus: kurus(),

    isPrimary: integer({ mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('vehicle_fuel_types_vehicle_idx').on(t.vehicleId)],
);

export type Vehicle = typeof vehicles.$inferSelect;
export type NewVehicle = typeof vehicles.$inferInsert;
export type VehicleFuelType = typeof vehicleFuelTypes.$inferSelect;
export type NewVehicleFuelType = typeof vehicleFuelTypes.$inferInsert;
