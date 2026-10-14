/**
 * Veri onaran yerel migration'lar — eski bir cihazın veritabanı kurulup
 * üzerine yeni migration koşuluyor.
 *
 * Şemayı değiştiren migration'ları `schema-parity.test.ts` denetliyor;
 * buradakiler VERİYE dokunanlar. Yanlış bir onarım geri alınamaz: cihaz
 * kaynak-doğruluk, bulut yalnızca yedek.
 */

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { applyMigrations, migrationIndex } from '../../tools/test-db.ts';

const A = '0199a000-0000-7000-8000-00000000000a';
const B = '0199b000-0000-7000-8000-00000000000b';

describe('0009 — tam sayı sütunlarında kalmış ondalıklar', () => {
  function oldDevice() {
    const db = new DatabaseSync(':memory:');
    const repair = migrationIndex('0009');
    applyMigrations(db, { until: repair });
    return { db, repair };
  }

  it('ondalık kilometre yuvarlanır, satır kuyruğa girer, takılmış denemesi sıfırlanır', () => {
    const { db, repair } = oldDevice();
    const insertShift = db.prepare(`INSERT INTO shifts
      (id, user_id, created_at, updated_at, vehicle_id, started_at, ended_at,
       distance_km, worked_minutes, business_date)
      VALUES (?, ?, 1, 100, 'v', 1, 2, ?, ?, '2026-09-18')`);
    insertShift.run('s-ondalik', A, 238.5, 90);
    insertShift.run('s-temiz', A, 120, 60);
    insertShift.run('s-yarim-dakika', A, 12, 30.5);

    // Gönderim bu satırı reddetmiş ve geri çekilmeye almış.
    db.prepare(`INSERT INTO outbox
      (table_name, row_id, user_id, operation, revision, attempt_count, last_error,
       next_attempt_at, created_at)
      VALUES ('shifts', 's-ondalik', ?, 'upsert', 3, 7, 'invalid input syntax', 999999, 1)`)
      .run(A);

    applyMigrations(db, { from: repair });

    const rows = db.prepare(`SELECT id, distance_km, typeof(distance_km) AS t,
      worked_minutes, updated_at FROM shifts ORDER BY id`).all().map((r) => ({ ...r }));
    assert.deepEqual(rows, [
      { id: 's-ondalik', distance_km: 239, t: 'integer', worked_minutes: 90, updated_at: 101 },
      { id: 's-temiz', distance_km: 120, t: 'integer', worked_minutes: 60, updated_at: 100 },
      { id: 's-yarim-dakika', distance_km: 12, t: 'integer', worked_minutes: 31, updated_at: 101 },
    ]);

    const queue = db.prepare(`SELECT row_id, user_id, operation, revision, attempt_count,
      last_error, next_attempt_at FROM outbox ORDER BY row_id`).all().map((r) => ({ ...r }));
    assert.deepEqual(queue, [
      {
        row_id: 's-ondalik', user_id: A, operation: 'upsert', revision: 4,
        attempt_count: 0, last_error: null, next_attempt_at: null,
      },
      {
        row_id: 's-yarim-dakika', user_id: A, operation: 'upsert', revision: 1,
        attempt_count: 0, last_error: null, next_attempt_at: null,
      },
    ]);
  });

  it('silinmiş satır silme olarak kuyruğa girer — dirilmez', () => {
    const { db, repair } = oldDevice();
    db.prepare(`INSERT INTO shifts
      (id, user_id, created_at, updated_at, deleted_at, vehicle_id, started_at,
       distance_km, business_date)
      VALUES ('s-silik', ?, 1, 5, 5, 'v', 1, 10.5, '2026-09-18')`).run(A);

    applyMigrations(db, { from: repair });

    const q = db.prepare('SELECT operation FROM outbox').get();
    assert.equal(q?.operation, 'delete');
    assert.equal(db.prepare('SELECT distance_km FROM shifts').get()?.distance_km, 11);
  });

  it('tam sayı veride hiçbir şey değişmez, kuyruk boş kalır', () => {
    const { db, repair } = oldDevice();
    db.prepare(`INSERT INTO vehicles
      (id, user_id, created_at, updated_at, label, ownership, wear_per_km_kurus)
      VALUES ('v', ?, 1, 1, 'Araç', 'owned', 250)`).run(A);
    applyMigrations(db, { from: repair });
    assert.equal(db.prepare('SELECT count(*) AS n FROM outbox').get()?.n, 0);
    assert.equal(db.prepare('SELECT updated_at FROM vehicles').get()?.updated_at, 1);
  });
});

describe('0010/0011 — vardiyanın yıpranma kopyası', () => {
  it('mevcut vardiyalar aracın o anki katsayısıyla dolar; kuyruk ve updated_at değişmez', () => {
    const db = new DatabaseSync(':memory:');
    const first = migrationIndex('0010');
    applyMigrations(db, { until: first });

    const insertVehicle = db.prepare(`INSERT INTO vehicles
      (id, user_id, created_at, updated_at, label, ownership, wear_per_km_kurus)
      VALUES (?, ?, 1, 1, 'Araç', ?, ?)`);
    insertVehicle.run('v-eski', A, 'owned', 300);
    insertVehicle.run('v-kiralik', A, 'rented_vehicle', 0);
    insertVehicle.run('v-yabanci', B, 'owned', 250);

    const insertShift = db.prepare(`INSERT INTO shifts
      (id, user_id, created_at, updated_at, vehicle_id, started_at, business_date)
      VALUES (?, ?, 1, 7, ?, 1, '2026-09-18')`);
    insertShift.run('s1', A, 'v-eski');
    insertShift.run('s2', A, 'v-kiralik');
    // Başka hesabın aracına bağlı vardiya: oran uydurulmaz, boş kalır.
    insertShift.run('s3', A, 'v-yabanci');

    const insertState = db.prepare('INSERT INTO sync_state (key, value, updated_at) VALUES (?, ?, 1)');
    insertState.run(`pull:${A}:shifts`, '{}');
    insertState.run(`pull:${A}:rides`, '{}');

    applyMigrations(db, { from: first });

    const rows = db.prepare('SELECT id, wear_per_km_kurus AS w, updated_at FROM shifts ORDER BY id')
      .all().map((r) => ({ ...r }));
    assert.deepEqual(rows, [
      { id: 's1', w: 300, updated_at: 7 },
      { id: 's2', w: 0, updated_at: 7 },
      { id: 's3', w: null, updated_at: 7 },
    ]);
    assert.equal(db.prepare('SELECT count(*) AS n FROM outbox').get()?.n, 0);

    // Araç sonradan değişse de kopya yerinde kalır.
    db.exec("UPDATE vehicles SET wear_per_km_kurus = 250 WHERE id = 'v-eski'");
    assert.equal(db.prepare("SELECT wear_per_km_kurus AS w FROM shifts WHERE id = 's1'").get()?.w, 300);

    // Yalnızca vardiyaların çekme imleci baştan alınır.
    const keys = db.prepare('SELECT key FROM sync_state ORDER BY key').all().map((r) => r.key);
    assert.deepEqual(keys, [`pull:${A}:rides`]);
  });
});
