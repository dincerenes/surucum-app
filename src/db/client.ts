import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';
import * as schema from './schema';
import { DATABASE_NAME } from './change-events';

export { DATABASE_NAME };

let sqliteClient: SQLite.SQLiteDatabase | null = null;
let database: ReturnType<typeof createDrizzle> | null = null;

function createDrizzle(client: SQLite.SQLiteDatabase) {
  /**
   * `casing: 'snake_case'` HEM burada HEM drizzle.config.ts'te olmalı.
   * Yalnızca birinde olursa üretilen migration ile çalışan sorgular farklı
   * sütun adları kullanır ve 'no such column' hatası alınır.
   */
  return drizzle(client, { schema, casing: 'snake_case' });
}

/**
 * Veritabanını AÇILIŞTA DEĞİL, ilk kullanımda açar.
 *
 * Modül yüklenirken açmak, bu dosyayı import eden her şeyi native SQLite'a
 * bağımlı kılar — test koşucusu, tip üretimi ve derleme araçları modülü
 * import edemez hâle gelir.
 */
export function getSqliteClient(): SQLite.SQLiteDatabase {
  if (!sqliteClient) {
    /**
     * `enableChangeListener` AÇIK OLMALI. Kapalıyken `useLiveQuery` ilk
     * veriyi getirir ama bir daha asla güncellenmez — hata da vermez,
     * sessizce donar.
     */
    sqliteClient = SQLite.openDatabaseSync(DATABASE_NAME, {
      enableChangeListener: true,
    });
  }
  return sqliteClient;
}

export function getDb() {
  if (!database) {
    database = createDrizzle(getSqliteClient());
  }
  return database;
}

export type Database = ReturnType<typeof getDb>;
export { schema };
