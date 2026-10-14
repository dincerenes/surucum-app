import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import {
  EXPENSE_KINDS, RECURRENCE_PERIODS, businessDate, kurus, syncColumns,
} from './_shared';

/**
 * Gider kategorisi. `isSystem` olanlar ilk açılışta oluşturulur;
 * kullanıcı silemez ama gizleyebilir ve kendi kategorisini ekleyebilir.
 */
export const expenseCategories = sqliteTable(
  'expense_categories',
  {
    ...syncColumns,

    name: text().notNull(),

    /** Değişken gider kilometreyle artar, sabit gider dönemseldir. */
    kind: text({ enum: EXPENSE_KINDS }).notNull().default('variable'),

    /** Arayüzde gösterilecek simge adı. */
    icon: text(),

    isSystem: integer({ mode: 'boolean' }).notNull().default(false),
    isActive: integer({ mode: 'boolean' }).notNull().default(true),
    sortOrder: integer().notNull().default(0),
  },
  (t) => [index('expense_categories_user_idx').on(t.userId, t.isActive)],
);

/** Tek seferlik gider. */
export const expenses = sqliteTable(
  'expenses',
  {
    ...syncColumns,

    categoryId: text().notNull(),
    vehicleId: text(),

    /**
     * Giderin girildiği vardiya.
     *
     * Kayıtlar vardiya vardiya listeleniyor ve her vardiya kartı KENDİ
     * cebe kalanını gösteriyor; aynı gün iki vardiya açan sürücüde
     * giderin hangisine düştüğü ancak bu bağla bilinir. Gider artık
     * yalnızca açık vardiyada (ya da vardiya kapanırken) giriliyor.
     *
     * Eski giderler için DOLDURULMADI: hangi vardiyaya ait oldukları
     * kesin bilinmiyor; listede "vardiya dışı" duruyorlar ve günün
     * toplamına yine giriyorlar.
     */
    shiftId: text(),

    amountKurus: kurus().notNull(),
    occurredAt: integer().notNull(),
    businessDate: businessDate().notNull(),

    /**
     * Fiş fotoğrafının cihazdaki göreli yolu. Görselin kendisi ASLA
     * veritabanına yazılmaz — veritabanını şişirir ve senkron yükünü bozar.
     */
    receiptPath: text(),

    notes: text(),
  },
  (t) => [
    index('expenses_user_date_idx').on(t.userId, t.businessDate),
    index('expenses_category_idx').on(t.categoryId),
    index('expenses_vehicle_idx').on(t.vehicleId),
    index('expenses_shift_idx').on(t.shiftId),
  ],
);

/**
 * Dönemsel sabit gider — kiralık plaka bedeli, kasko, MTV, muayene.
 *
 * TASARIM KARARI — bu satırlar günlük gider kaydına AÇILMAZ. Günlük pay
 * rapor anında hesaplanır. Sebep: her kullanıcı için günde bir satır üretmek
 * yılda 365 gereksiz satır demek ve dönem/tutar düzeltmesi geriye dönük
 * yeniden üretim gerektirir.
 *
 * Bu tablo TAHAKKUK içindir. Ödemenin kendisi ayrıca `expenses`'a
 * girilmez — girilirse aynı maliyet iki kez sayılır.
 */
export const recurringExpenses = sqliteTable(
  'recurring_expenses',
  {
    ...syncColumns,

    categoryId: text().notNull(),
    vehicleId: text(),

    name: text().notNull(),
    amountKurus: kurus().notNull(),
    period: text({ enum: RECURRENCE_PERIODS }).notNull().default('monthly'),

    startDate: businessDate().notNull(),
    /** Boşsa süresizdir. */
    endDate: businessDate(),

    isActive: integer({ mode: 'boolean' }).notNull().default(true),
    notes: text(),
  },
  (t) => [index('recurring_expenses_user_idx').on(t.userId, t.isActive)],
);

export type ExpenseCategory = typeof expenseCategories.$inferSelect;
export type NewExpenseCategory = typeof expenseCategories.$inferInsert;
export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
export type RecurringExpense = typeof recurringExpenses.$inferSelect;
export type NewRecurringExpense = typeof recurringExpenses.$inferInsert;
