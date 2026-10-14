import {
  index, integer, primaryKey, sqliteTable, text, uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { GOAL_PERIODS, businessDate, kurus, syncColumns } from './_shared';

/** Kullanıcı ayarları. Tek satır tutulur, cihazlar arası senkronlanır. */
export const appSettings = sqliteTable('app_settings', {
  ...syncColumns,

  /**
   * Gün kesme saati (0–23). Bu saatten önceki kayıtlar bir önceki
   * iş gününe yazılır. Gece vardiyası çalışan sürücü için hayati.
   */
  dayCutoffHour: integer().notNull().default(4),

  defaultVehicleId: text(),

  /** Yakıt fiyatı sorgusu için il kodu. */
  regionCode: text().notNull().default('TR'),

  /** Sefer eklerken varsayılan kazanç kaynağı — girişi hızlandırır. */
  defaultEarningSourceId: text(),

  /** Kullanıcı ilk kurulum akışını tamamladı mı? */
  onboardingCompletedAt: integer(),

  /**
   * Sürücünün adı — Anasayfa'daki selamlama. Kayıt olurken sorulup ilk
   * kurulumda buraya yazılıyor; boşsa selamlama adsız ("Günaydın").
   */
  displayName: text(),

  /** Çalıştığı şehir (81 ilden biri). Profil'de gösteriliyor. */
  city: text(),

  /**
   * Profil resmi. Boşsa adın baş harfli hazır avatar çiziliyor. Seçilen
   * hazır avatarın anahtarı ya da yüklenen fotoğrafın yolu (Profil fazı).
   */
  avatar: text(),
});

/** Kazanç hedefi. */
export const goals = sqliteTable(
  'goals',
  {
    ...syncColumns,

    period: text({ enum: GOAL_PERIODS }).notNull().default('daily'),
    targetNetKurus: kurus().notNull(),

    startDate: businessDate().notNull(),
    endDate: businessDate(),

    isActive: integer({ mode: 'boolean' }).notNull().default(true),
  },
  (t) => [index('goals_user_idx').on(t.userId, t.isActive)],
);

// ---------------------------------------------------------------------------
// Yerel-yalnız tablolar — buluta senkronlanmaz
// ---------------------------------------------------------------------------

/**
 * Senkron kuyruğu.
 *
 * TASARIM KARARI — satırın kendisi değil, yalnızca KİMLİĞİ tutulur.
 * Sürücü aynı seferi beş kez düzeltirse kuyrukta yine tek satır olur ve
 * gönderim anında kaydın son hâli okunur. Payload saklamak, beş ayrı
 * gönderim ve sıralama sorunu demek olurdu.
 *
 * `id` otomatik artan tam sayıdır: ekleme sırası, yabancı anahtar
 * bağımlılıklarının doğru sırada gönderilmesi için gerekiyor
 * (vardiya, kendisine bağlı seferlerden önce gitmeli).
 */
export const outbox = sqliteTable(
  'outbox',
  {
    id: integer().primaryKey({ autoIncrement: true }),

    tableName: text().notNull(),
    rowId: text().notNull(),
    operation: text({ enum: ['upsert', 'delete'] }).notNull(),

    /**
     * Satırın SAHİBİ — kuyruğa yazılırken satırın kendisinden, aynı
     * işlemde okunur.
     *
     * Aynı cihazda iki hesap kullanıldığında kuyrukta ikisinin kaydı da
     * durur. Gönderim yalnızca oturumdaki hesabın kayıtlarını seçmeli;
     * süzgeç olmadan A'nın bekleyen 400 kaydı her turda sıranın başını
     * tutuyor ve B'nin hiçbir kaydı gitmiyordu. Yalnızca eski sürümden
     * kalan ve yerel satırı olmayan girdilerde boştur.
     */
    userId: text(),

    /**
     * Her kuyruğa yazmada bir artar.
     *
     * Gönderim ağ isteğini beklerken sürücü aynı kaydı düzeltirse kuyruk
     * satırı YERİNDE güncellenir, kimliği değişmez. Onay yalnızca kimliğe
     * bakıyor olsaydı, gönderilmemiş yeni düzeltmenin kuyruk kaydını da
     * siler ve bulut eski hâlde kalırdı. Onay ve geri çekilme bu yüzden
     * kimlik + revizyon eşleşirse yazılır.
     */
    revision: integer().notNull().default(1),

    attemptCount: integer().notNull().default(0),
    lastError: text(),
    lastAttemptAt: integer(),

    /** Üstel geri çekilme: bu zamandan önce yeniden denenmez. */
    nextAttemptAt: integer(),

    createdAt: integer().notNull(),
  },
  (t) => [
    // Aynı satır için tek bekleyen kayıt — tekrar düzenlemeler çakışır.
    uniqueIndex('outbox_row_unique_idx').on(t.tableName, t.rowId),
    // Gönderim her zaman tek hesabın hazır kayıtlarını ekleme sırasıyla ister.
    index('outbox_user_ready_idx').on(t.userId, t.nextAttemptAt, t.id),
  ],
);

/**
 * Kurtarma taramasında buluttan GÖRÜLEN satırlar — geçici defter.
 *
 * Eski senkron bazı düzeltmeleri kuyruktan buluta hiç göndermeden
 * düşürdü. Bir hesabın ilk tam taramasında buluttan gelen her kimlik
 * buraya yazılır; tablo sonuna kadar inince, cihazda olup burada
 * olmayan ve kuyrukta da beklemeyen satırlar yeniden kuyruğa alınır ve
 * defter temizlenir. Tarama birkaç tura yayılabildiği ve uygulama
 * arada kapanabildiği için bellek değil tablo.
 */
export const syncRecoverySeen = sqliteTable(
  'sync_recovery_seen',
  {
    userId: text().notNull(),
    tableName: text().notNull(),
    rowId: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tableName, t.rowId] })],
);

/**
 * CİHAZ tercihleri — anahtar/değer, yerel kalır, buluta GİTMEZ.
 *
 * Tema burada duruyor, `app_settings`'te değil ve bu bilinçli: aynı hesabı
 * iki cihazda kullanan sürücünün telefonu koyu, tableti açık olabilir.
 * Senkronlasaydık bir cihazda yapılan seçim diğerinin ekranını da
 * çevirirdi.
 *
 * Kesme saati ise tersine HESABA aittir (`app_settings.day_cutoff_hour`):
 * kaydın hangi güne yazıldığını belirliyor ve cihaza göre değişemez.
 */
export const devicePrefs = sqliteTable('device_prefs', {
  key: text().primaryKey(),
  value: text(),
  updatedAt: integer().notNull(),
});

/**
 * Senkron durumu — çekme imleci, son başarılı senkron zamanı gibi
 * anahtar/değer çiftleri. Yerel kalır.
 */
export const syncState = sqliteTable('sync_state', {
  key: text().primaryKey(),
  value: text(),
  updatedAt: integer().notNull(),
});

export type AppSettings = typeof appSettings.$inferSelect;
export type NewAppSettings = typeof appSettings.$inferInsert;
export type Goal = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;
export type DevicePref = typeof devicePrefs.$inferSelect;
export type OutboxEntry = typeof outbox.$inferSelect;
export type NewOutboxEntry = typeof outbox.$inferInsert;
