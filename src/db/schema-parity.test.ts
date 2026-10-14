/**
 * Yerel SQLite şeması ile buluttaki Postgres şemasının SÜTUN ADLARI
 * birebir aynı mı?
 *
 * NEDEN BU TEST VAR: senkron, satırları hiçbir eşleme yapmadan olduğu
 * gibi gönderiyor — `SELECT *` ile okunan snake_case anahtarlar doğrudan
 * PostgREST'e gidiyor. Tek harflik bir sapma o tabloyu sessizce
 * senkronsuz bırakır: yazma yerelde başarılı olur, kuyrukta sonsuza
 * kadar reddedilir ve sürücü verisinin buluta gitmediğini öğrenemez.
 *
 * Bu tam olarak bir kez oldu: drizzle'ın otomatik adlandırması
 * `avgConsumptionPer100Km` alanını `avg_consumption_per100_km` yaptı,
 * bulutta ise `avg_consumption_per_100km` duruyordu. Faz 1'den beri
 * bozuktu ve hiçbir tip denetimi yakalamadı.
 *
 * Bulut tarafı `supabase/cloud-columns.json` içinde donduruldu; şema
 * değişince o dosya da güncellenmeli.
 */

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { BOOLEAN_COLUMNS } from '../sync/tables.ts';

interface CloudManifest {
  bool: Record<string, string[]>;
  /** Bulutta tam sayı olan sütunlar: 'integer' (32 bit) ya da 'bigint'. */
  int: Record<string, Record<string, 'integer' | 'bigint'>>;
  tables: Record<string, string[]>;
}

const manifest: CloudManifest = JSON.parse(
  readFileSync(new URL('../../supabase/cloud-columns.json', import.meta.url), 'utf8'),
);

const journal: { entries: { tag: string }[] } = JSON.parse(
  readFileSync(new URL('../../drizzle/meta/_journal.json', import.meta.url), 'utf8'),
);

/** Migration'ların tamamını bellek içi bir veritabanına uygular. */
function buildLocalSchema(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  for (const entry of journal.entries) {
    const sql = readFileSync(
      new URL(`../../drizzle/${entry.tag}.sql`, import.meta.url), 'utf8',
    );
    for (const statement of sql.split('--> statement-breakpoint')) {
      if (statement.trim()) db.exec(statement);
    }
  }
  return db;
}

function columnsOf(db: DatabaseSync, table: string): string[] {
  return db.prepare('select name from pragma_table_info(?)')
    .all(table)
    .map((r) => String((r as { name: unknown }).name));
}

function typesOf(db: DatabaseSync, table: string): Map<string, string> {
  return new Map(db.prepare('select name, type from pragma_table_info(?)')
    .all(table)
    .map((r) => [String(r.name), String(r.type).toLowerCase()]));
}

describe('yerel şema ile bulut şeması', () => {
  const db = buildLocalSchema();

  it('migration\'ların tamamı hatasız uygulanıyor', () => {
    assert.ok(journal.entries.length >= 4);
    assert.ok(columnsOf(db, 'vehicles').length > 0);
  });

  for (const table of Object.keys(manifest.tables)) {
    it(`${table} — sütun adları birebir eşleşiyor`, () => {
      const local = new Set(columnsOf(db, table));
      const cloud = new Set(manifest.tables[table]);

      const onlyLocal = [...local].filter((c) => !cloud.has(c));
      const onlyCloud = [...cloud].filter((c) => !local.has(c));

      assert.deepEqual(onlyLocal, [], `yalnız yerelde: ${onlyLocal.join(', ')}`);
      assert.deepEqual(onlyCloud, [], `yalnız bulutta: ${onlyCloud.join(', ')}`);
    });
  }

  it('boolean sütunlarının tamamı yerelde de var', () => {
    for (const [table, cols] of Object.entries(manifest.bool)) {
      const local = new Set(columnsOf(db, table));
      for (const c of cols) {
        assert.ok(local.has(c), `${table}.${c} yerelde yok`);
      }
    }
  });

  /**
   * Ad eşitliği yetmiyor: SQLite her sütuna her şeyi yazdırıyor, Postgres
   * yazdırmıyor. Yerelde INTEGER olan bir sütun bulutta metin olsaydı —
   * ya da tersi — gönderim o tabloyu kalıcı olarak takardı.
   */
  for (const table of Object.keys(manifest.tables)) {
    it(`${table} — tip sınıfları eşleşiyor (INTEGER ↔ integer/bigint/boolean)`, () => {
      const cloudInt = new Set(Object.keys(manifest.int[table] ?? {}));
      const cloudBool = new Set(manifest.bool[table] ?? []);
      for (const [name, type] of typesOf(db, table)) {
        const cloudNumeric = cloudInt.has(name) || cloudBool.has(name);
        if (type === 'integer') {
          assert.ok(cloudNumeric, `${table}.${name}: yerelde integer, bulutta tam sayı değil`);
        } else {
          assert.equal(type, 'text', `${table}.${name}: beklenmeyen yerel tip ${type}`);
          assert.ok(!cloudNumeric, `${table}.${name}: yerelde metin, bulutta sayı`);
        }
      }
    });
  }

  it('senkronun çevirdiği boolean listesi buluttakiyle birebir aynı', () => {
    const normalize = (m: Readonly<Record<string, readonly string[]>>) => Object.fromEntries(
      Object.entries(m).map(([t, cols]) => [t, [...cols].sort()]).sort(([a], [b]) => (a < b ? -1 : 1)),
    );
    assert.deepEqual(normalize(BOOLEAN_COLUMNS), normalize(manifest.bool));
  });

  it('server_updated_at yerelde YOK — o yalnızca sunucunun imleci', () => {
    for (const table of Object.keys(manifest.tables)) {
      assert.ok(!columnsOf(db, table).includes('server_updated_at'),
        `${table} yerelde server_updated_at taşıyor`);
    }
  });
});
