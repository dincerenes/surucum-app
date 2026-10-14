/**
 * Testlerde `@/db/client` yerine geçen bellek içi veritabanı.
 *
 * `tools/test-register.mjs` `src/db/client.ts` isteğini buraya yönlendirir.
 * Üstteki her şey üretimle AYNI: Drizzle'ın expo-sqlite sürücüsü, aynı
 * şema, `drizzle/` altındaki migration'ların tamamı. Yalnızca en alttaki
 * bağlantı `expo-sqlite` yerine `node:sqlite` — o da `expo-sqlite`'ın
 * kodun kullandığı senkron yüzeyini birebir taklit ediyor.
 */

import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite/driver';
import * as schema from '../src/db/schema/index.ts';

export const DATABASE_NAME = 'test.db';
export { schema };

type Params = unknown[];

/** expo-sqlite bağlamaya boolean ve undefined da kabul ediyor; node:sqlite etmiyor. */
function bind(params: Params): SQLInputValue[] {
  const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] as unknown[] : params;
  return flat.map((v) => {
    if (v === undefined) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    return v as SQLInputValue;
  });
}

function returnsRows(statement: StatementSync): boolean {
  return statement.columns().length > 0;
}

/** `expo-sqlite`'ın `SQLiteDatabase` sınıfının kodun kullandığı senkron alt kümesi. */
class ExpoLikeDatabase {
  readonly raw: DatabaseSync;

  constructor(raw: DatabaseSync) {
    this.raw = raw;
  }

  prepareSync(source: string) {
    const statement = this.raw.prepare(source);
    const reads = returnsRows(statement);
    return {
      executeSync: (params: Params = []) => {
        if (reads) {
          const rows = statement.all(...bind(params));
          return {
            changes: 0, lastInsertRowId: 0,
            getAllSync: () => rows, getFirstSync: () => rows[0] ?? null,
          };
        }
        const r = statement.run(...bind(params));
        return {
          changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid),
          getAllSync: () => [], getFirstSync: () => null,
        };
      },
      executeForRawResultSync: (params: Params = []) => {
        statement.setReturnArrays(true);
        try {
          const rows = statement.all(...bind(params));
          return { getAllSync: () => rows };
        } finally {
          statement.setReturnArrays(false);
        }
      },
      finalizeSync: () => {},
    };
  }

  getAllSync<T>(source: string, ...params: Params): T[] {
    return this.raw.prepare(source).all(...bind(params)) as T[];
  }

  getFirstSync<T>(source: string, ...params: Params): T | null {
    return (this.raw.prepare(source).get(...bind(params)) as T | undefined) ?? null;
  }

  runSync(source: string, ...params: Params) {
    const r = this.raw.prepare(source).run(...bind(params));
    return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
  }

  execSync(source: string): void {
    this.raw.exec(source);
  }
}

interface JournalEntry { idx: number; tag: string }

const journal: { entries: JournalEntry[] } = JSON.parse(
  readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'),
);

/**
 * `drizzle/` migration'larını sırayla uygular.
 *
 * `until` verilirse o sıra numarasına KADAR (hariç) uygulanır — eski bir
 * cihazın veritabanını kurup üzerine yeni migration'ı koşmak için.
 */
export function applyMigrations(
  db: DatabaseSync, range: { from?: number; until?: number } = {},
): void {
  for (const entry of journal.entries) {
    if (entry.idx < (range.from ?? 0)) continue;
    if (range.until !== undefined && entry.idx >= range.until) continue;
    const source = readFileSync(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), 'utf8');
    for (const statement of source.split('--> statement-breakpoint')) {
      if (statement.trim()) db.exec(statement);
    }
  }
}

/** Migration sıra numarası — etiketin baştaki dört hanesi değil, günlükteki `idx`. */
export function migrationIndex(tagPrefix: string): number {
  const entry = journal.entries.find((e) => e.tag.startsWith(tagPrefix));
  if (!entry) throw new Error(`migration yok: ${tagPrefix}`);
  return entry.idx;
}

function open() {
  const raw = new DatabaseSync(':memory:');
  applyMigrations(raw);
  const client = new ExpoLikeDatabase(raw);
  // Üretimdeki `createDrizzle` ile aynı ayar: casing iki tarafta da şart.
  const db = drizzle(client as never, { schema, casing: 'snake_case' });
  return { raw, client, db };
}

let current = open();

/** Her testin başında çağrılır: boş, migration'ları uygulanmış yeni veritabanı. */
export function resetTestDb(): void {
  current.raw.close();
  current = open();
}

/** Doğrudan SQL ile kurulum ve doğrulama için ham bağlantı. */
export function rawTestDb(): DatabaseSync {
  return current.raw;
}

export function getDb() {
  return current.db;
}

export function getSqliteClient() {
  return current.client;
}
