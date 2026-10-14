import {
  index, integer, sqliteTable, text, uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { FUEL_TYPES, businessDate, kurus, syncColumns } from './_shared';

/**
 * Yakıt dolumu.
 *
 * `isFullTank` işaretli iki kayıt arasındaki kilometre ve litre, aracın
 * GERÇEK tüketimini verir (tam depo yöntemi). Bu ölçüm biriktikçe
 * `vehicleFuelTypes.avgConsumptionPer100Km` otomatik kalibre olur ve
 * dolum kaydı girilmeyen günlerin tahmini de doğrulaşır.
 */
export const fuelLogs = sqliteTable(
  'fuel_logs',
  {
    ...syncColumns,

    vehicleId: text().notNull(),
    fuelType: text({ enum: FUEL_TYPES }).notNull(),

    /**
     * Dolum açık bir vardiya sırasında girildiyse o vardiya.
     *
     * YAKIT VARDİYA BAŞINA TEK SAYI: tüketim × km × fiyat hesaplanabiliyorsa
     * o sayılır, hesaplanamıyorsa o vardiyaya bağlı dolumlar. Bağ olmadan
     * günün TEK bir tüketimli vardiyası o günün bütün dolumlarını hesaptan
     * çıkarıyordu — tüketimi girilmemiş diğer vardiyanın yakıtı sıfır
     * görünüyordu. Vardiyasız dolumun kuralı `day-summary.ts`'te.
     *
     * Eski dolumlar için DOLDURULMADI: hangi vardiyaya ait olduğu
     * bilinmiyor; vardiyasız dolum kuralı onları taşıyor.
     */
    shiftId: text(),

    occurredAt: integer().notNull(),
    businessDate: businessDate().notNull(),

    /** Sıvı/gaz yakıtta mililitre, elektrikte watt-saat. Tam sayı. */
    volumePer1000: integer().notNull(),

    /** Birim başına kuruş: litre, kg veya kWh. */
    unitPriceKurus: kurus().notNull(),
    totalAmountKurus: kurus().notNull(),

    odometerKm: integer(),

    /** Gerçek tüketim hesabının şartı — depo ağzına kadar dolduruldu mu? */
    isFullTank: integer({ mode: 'boolean' }).notNull().default(true),

    /** Kullanıcının yazdığı istasyon adı — bu onun kendi verisi. */
    stationName: text(),

    receiptPath: text(),
    notes: text(),
  },
  (t) => [
    index('fuel_logs_user_date_idx').on(t.userId, t.businessDate),
    index('fuel_logs_vehicle_idx').on(t.vehicleId, t.occurredAt),
    index('fuel_logs_shift_idx').on(t.shiftId),
  ],
);

/**
 * Sunucudan çekilen güncel akaryakıt fiyatları.
 *
 * Bu tablo TEK YÖNLÜDÜR: sunucudan cihaza iner, cihazdan sunucuya gitmez.
 * `outbox`'a hiç uğramaz. Kullanıcıya ait veri değil, ortak referans veridir —
 * bu yüzden `userId` taşımaz.
 *
 * Çevrimdışıyken son bilinen fiyat kullanılır; `fetchedAt` arayüzde
 * gösterilir ki sürücü verinin ne kadar taze olduğunu bilsin.
 */
export const fuelPrices = sqliteTable(
  'fuel_prices',
  {
    id: text().primaryKey(),

    /** İl kodu (plaka kodu) veya ülke geneli için 'TR'. */
    regionCode: text().notNull(),
    fuelType: text({ enum: FUEL_TYPES }).notNull(),

    unitPriceKurus: kurus().notNull(),

    /** Fiyatın geçerli olduğu gün. */
    effectiveDate: businessDate().notNull(),

    /** Veriyi hangi kaynaktan aldık — kaynak değişince izlenebilsin. */
    source: text().notNull(),

    fetchedAt: integer().notNull(),
  },
  (t) => [
    uniqueIndex('fuel_prices_unique_idx').on(t.regionCode, t.fuelType, t.effectiveDate),
    index('fuel_prices_lookup_idx').on(t.regionCode, t.fuelType, t.effectiveDate),
  ],
);

export type FuelLog = typeof fuelLogs.$inferSelect;
export type NewFuelLog = typeof fuelLogs.$inferInsert;
export type FuelPrice = typeof fuelPrices.$inferSelect;
export type NewFuelPrice = typeof fuelPrices.$inferInsert;
