import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import {
  PAYMENT_METHODS, ZERO_BPS, ZERO_KURUS, bps, businessDate, kurus, syncColumns,
} from './_shared';

/**
 * Kazanç kaynağı — sürücünün parayı nereden kazandığı.
 *
 * Bu liste UYGULAMA TARAFINDAN DOLDURULMAZ. Kullanıcı kendi kaynaklarını
 * kendi adlandırır. Uygulama hiçbir yerde üçüncü taraf marka adı taşımaz;
 * tohum veride bile taşımaz.
 */
export const earningSources = sqliteTable(
  'earning_sources',
  {
    ...syncColumns,

    name: text().notNull(),

    /**
     * Varsayılan komisyon oranı, baz puan (2500 = %25,00).
     * Sefer kaydında bu oranın anlık kopyası saklanır — sonradan
     * oran değişince geçmiş seferler kaymasın diye.
     */
    defaultCommissionBps: bps().notNull().default(ZERO_BPS),

    /** Grafiklerde ayırt etmek için. */
    colorHex: text(),

    isActive: integer({ mode: 'boolean' }).notNull().default(true),
    sortOrder: integer().notNull().default(0),
  },
  (t) => [index('earning_sources_user_idx').on(t.userId, t.isActive)],
);

/**
 * Vardiya. TL/saat ve TL/km hesabının paydası bu tablodan gelir.
 *
 * `endedAt` boşsa vardiya açıktır — sürücü şu an direksiyonda.
 *
 * TASARIM KARARI — vardiya BAŞLARKEN hiçbir şey sorulmaz, tek tuş.
 * Mesafe ve süre vardiya BİTERKEN, sürücünün kendi ağzından alınır.
 * Sebep: sürücü işe başlarken telefonla uğraşmaz; akşam hesabı
 * kapatırken uğraşır. Başlangıçta soru sorarsak vardiya hiç açılmaz.
 */
export const shifts = sqliteTable(
  'shifts',
  {
    ...syncColumns,

    vehicleId: text().notNull(),

    startedAt: integer().notNull(),
    endedAt: integer(),

    /**
     * O gün uygulamaya ödenen toplam komisyon — sürücü vardiya sonunda
     * TEK RAKAM olarak yazar.
     *
     * ORAN KULLANILMIYOR. Sürücü yüzdesini bilmiyor, eline geçeni ve
     * kesileni biliyor. Sefer başına oran uygulamak hem girişi
     * yavaşlatıyor hem de sürücünün doğrulayamadığı bir sayı üretiyordu.
     *
     * `rides.commission_kurus` sütunu duruyor ve sıfır kalıyor; gün
     * özeti ikisini de topluyor, yani ileride sefer başına kesinti
     * gerekirse kapı açık.
     */
    commissionKurus: kurus(),

    /**
     * Aracın ortalama tüketimi — sürücü vardiya sonunda yazar, 100 km
     * başına MİLİLİTRE. Örnek: 7,5 lt/100km → 7500
     *
     * Neden vardiyaya yazılıyor da araca değil: araçtaki değer sürücünün
     * en son beyanı ve değişebilir. Geçmiş bir günün yakıt maliyeti,
     * bugün girilen yeni bir tüketimle kaymamalı. Sefer kaydının komisyon
     * oranını kopyalamasıyla aynı mantık — kayıt kendini açıklıyor.
     *
     * Araçtaki değer yalnızca ÖNCEDEN DOLDURMAK için: sürücü çoğu gün
     * onaylayıp geçiyor.
     *
     * Sütun adı ELLE VERİLDİ: drizzle'ın otomatik adlandırması
     * `fuel_consumption_per100_km` üretiyor. Aynı hata bir kez yaşandı ve
     * o tabloyu buluttan tamamen kopardı — `avg_consumption_per_100km` ile
     * aynı yazımda kalması şart.
     */
    fuelConsumptionPer100Km: integer('fuel_consumption_per_100km'),

    /**
     * Hesapta kullanılan birim yakıt fiyatı, kuruş/litre.
     *
     * Bu da vardiyaya kopyalanıyor: fiyat her hafta değişiyor ve geçmiş
     * günün maliyeti bugünkü fiyatla yeniden hesaplanmamalı.
     */
    fuelPriceKurus: kurus(),

    /**
     * Kilometre başına yıpranma payı, kuruş — vardiya AÇILDIĞI ANDA
     * aracın katsayısının KOPYASI. Kullanıcıya sorulmaz, düzenlenmez
     * (kural 6); tüketim ve fiyatın kopyalanmasıyla aynı mantık.
     *
     * Neden kopya: rapor eskiden aracın BUGÜNKÜ katsayısını okuyordu.
     * Aracın yalnızca adı değiştirilse bile katsayı güncel sabitle yeniden
     * yazılıyor ve bütün geçmiş vardiyaların gerçek kârı kayıyordu;
     * aracını satın alan kiralık sürücünün geçmişi de sıfırdan 250'ye
     * çıkıyordu. Sahiplik değişince geçmişe uygulanıp uygulanmayacağını
     * sürücü seçiyor (bkz. `updateVehicle`).
     *
     * Boşsa (bu sütundan önce açılmış ve buluttan öyle inmiş vardiya)
     * okuma aracın katsayısına düşer. Mevcut satırlar migration'da aracın
     * o anki katsayısıyla dolduruldu — KESİN GEÇMİŞ BİLİNMİYORDU.
     */
    wearPerKmKurus: kurus(),

    /**
     * Vardiya boyunca yapılan kilometre — sürücü vardiya sonunda yazar.
     * Kilometre SAYACI değil, KAT EDİLEN yoldur; sürücü "bugün 280 yaptım"
     * der, sayaç okumaz. Km yıpranma payının tek girdisi budur.
     *
     * Boşsa yıpranma payı hesaplanmaz, tahmin edilmez (bkz. `profit.ts`).
     */
    distanceKm: integer(),

    /**
     * Fiilen çalışılan süre, dakika — sürücü vardiya sonunda yazar.
     *
     * `endedAt - startedAt` farkı VARDIR ama doğru değildir: sürücü mola
     * verir ve vardiyayı kapatmayı unutur. Unutulan vardiya ertesi gün
     * kapatılınca fark 30 saat çıkar ve TL/saat çöpe döner. Sürücünün
     * yazdığı süre o farkı EZER. Boşsa farka düşülür.
     */
    workedMinutes: integer(),

    /**
     * Kilometre sayacı okumaları. Vardiya akışında SORULMAZ — burada
     * duruyorlar çünkü yakıt dolumu ekranı sayacı zaten soruyor
     * (`fuelLogs.odometerKm`) ve tam depo yöntemi ileride bu iki uçtan
     * beslenebilir. Faz 2 akışı ikisini de yazmaz.
     */
    startOdometerKm: integer(),
    endOdometerKm: integer(),

    /**
     * Vardiyanın ait olduğu iş günü. Gece 22:00'de başlayan vardiya
     * sabaha sarksa da tek bir iş gününe yazılır.
     */
    businessDate: businessDate().notNull(),

    notes: text(),
  },
  (t) => [
    index('shifts_user_date_idx').on(t.userId, t.businessDate),
    index('shifts_open_idx').on(t.userId, t.endedAt),
  ],
);

/**
 * Sefer.
 *
 * TASARIM KARARI — brüt, komisyon ve net üçü de saklanıyor, ikisi
 * diğerinden türetilmiyor. Sebep: kullanıcı bir kazanç kaynağının komisyon
 * oranını sonradan değiştirdiğinde geçmiş seferlerin tutarı DEĞİŞMEMELİ.
 * Oranın anlık kopyası (`commissionBps`) da saklanıyor ki kayıt kendi
 * kendini açıklasın ve denetlenebilsin.
 */
export const rides = sqliteTable(
  'rides',
  {
    ...syncColumns,

    /** Vardiya dışında da sefer olabilir; bu yüzden boş bırakılabilir. */
    shiftId: text(),
    earningSourceId: text().notNull(),
    vehicleId: text(),

    occurredAt: integer().notNull(),
    businessDate: businessDate().notNull(),

    grossAmountKurus: kurus().notNull(),
    commissionKurus: kurus().notNull().default(ZERO_KURUS),
    netAmountKurus: kurus().notNull(),

    /** Kaydın oluşturulduğu andaki komisyon oranının kopyası. */
    commissionBps: bps().notNull().default(ZERO_BPS),

    /** Bahşiş komisyona tabi değildir, ayrı tutulur. */
    tipKurus: kurus().notNull().default(ZERO_KURUS),

    paymentMethod: text({ enum: PAYMENT_METHODS }).notNull().default('app'),

    /** Metre cinsinden — 3,4 km gibi küsuratlı mesafeler kayan nokta olmasın. */
    distanceMeters: integer(),
    durationSeconds: integer(),

    notes: text(),
  },
  (t) => [
    index('rides_user_date_idx').on(t.userId, t.businessDate),
    index('rides_shift_idx').on(t.shiftId),
    index('rides_source_idx').on(t.earningSourceId),
    index('rides_occurred_idx').on(t.userId, t.occurredAt),
  ],
);

export type EarningSource = typeof earningSources.$inferSelect;
export type NewEarningSource = typeof earningSources.$inferInsert;
export type Shift = typeof shifts.$inferSelect;
export type NewShift = typeof shifts.$inferInsert;
export type Ride = typeof rides.$inferSelect;
export type NewRide = typeof rides.$inferInsert;
