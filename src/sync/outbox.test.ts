/**
 * Kuyruğa yazma: sahip, revizyon ve eski kuyruğun taşınması.
 *
 * Gerçek `enqueue` ve gerçek migration'lar, node:sqlite üzerinde.
 */

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, it } from 'node:test';
import { eq } from 'drizzle-orm';
import { goals } from '@/db/schema';
import { softDeleteRow, stampNew, withOutbox } from '@/db/repo/_base';
import {
  applyMigrations, migrationIndex, rawTestDb, resetTestDb,
} from '../../tools/test-db.ts';

const A = '0199a000-0000-7000-8000-00000000000a';
const B = '0199b000-0000-7000-8000-00000000000b';

interface QueueRow {
  table_name: string; row_id: string; user_id: string | null;
  revision: number; operation: string; attempt_count: number;
  next_attempt_at: number | null;
}

function queue(): QueueRow[] {
  return rawTestDb().prepare('SELECT * FROM outbox ORDER BY id').all() as unknown as QueueRow[];
}

function addGoal(userId: string, amount: number, now = 1000): string {
  const stamp = stampNew(userId, now);
  withOutbox('goals', stamp.id, 'upsert', (tx) => {
    tx.insert(goals).values({
      ...stamp, targetNetKurus: amount as never, startDate: '2026-09-01' as never,
    }).run();
  }, now);
  return stamp.id;
}

function editGoal(id: string, amount: number, now: number): void {
  withOutbox('goals', id, 'upsert', (tx) => {
    tx.update(goals).set({ targetNetKurus: amount as never, updatedAt: now })
      .where(eq(goals.id, id)).run();
  }, now);
}

describe('enqueue', () => {
  beforeEach(() => resetTestDb());

  it('sahibi satırın kendisinden yazar', () => {
    addGoal(A, 100);
    addGoal(B, 200);
    assert.deepEqual(queue().map((q) => q.user_id), [A, B]);
  });

  it('her düzenlemede revizyon artar, kuyrukta tek satır kalır', () => {
    const id = addGoal(A, 100);
    editGoal(id, 150, 2000);
    editGoal(id, 200, 2000); // aynı milisaniye
    const rows = queue();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].revision, 3);
    assert.equal(rows[0].row_id, id);
  });

  it('düzenleme deneme sayacını ve beklemeyi sıfırlar', () => {
    const id = addGoal(A, 100);
    rawTestDb().exec('UPDATE outbox SET attempt_count = 7, next_attempt_at = 99999, last_error = \'x\'');
    editGoal(id, 150, 2000);
    const [row] = queue();
    assert.equal(row.attempt_count, 0);
    assert.equal(row.next_attempt_at, null);
  });

  it('silme bekleyen güncellemeyi ezer', () => {
    const id = addGoal(A, 100);
    softDeleteRow(goals, 'goals', A, id, 3000);
    assert.equal(queue()[0].operation, 'delete');
    assert.equal(queue()[0].revision, 2);
  });

  it('VAR OLMAYAN kimlik kuyruğa yazılmaz', () => {
    editGoal('0199ffff-0000-7000-8000-000000000000', 5, 2000);
    softDeleteRow(goals, 'goals', A, '0199ffff-0000-7000-8000-000000000001', 2000);
    assert.equal(queue().length, 0);
  });
});

describe('0008 — eski kuyruğa sahip yazılması', () => {
  it('yerel satırı olanlar sahibini alır, olmayanlar boş kalır; eski imleç silinir', () => {
    const db = new DatabaseSync(':memory:');
    const firstNew = migrationIndex('0007');
    applyMigrations(db, { until: firstNew });

    const insertGoal = db.prepare(`INSERT INTO goals
      (id, user_id, created_at, updated_at, period, target_net_kurus, start_date)
      VALUES (?, ?, 1, 1, 'daily', 100, '2026-09-01')`);
    insertGoal.run('g-a', A);
    insertGoal.run('g-b', B);
    db.prepare(`INSERT INTO vehicles
      (id, user_id, created_at, updated_at, label, ownership, wear_per_km_kurus)
      VALUES ('v-a', ?, 1, 1, 'Araç', 'owned', 250)`).run(A);

    const insertQueue = db.prepare(`INSERT INTO outbox
      (table_name, row_id, operation, attempt_count, created_at) VALUES (?, ?, 'upsert', 0, 1)`);
    insertQueue.run('goals', 'g-a');
    insertQueue.run('goals', 'g-b');
    insertQueue.run('vehicles', 'v-a');
    insertQueue.run('goals', 'yerelde-yok');

    const insertState = db.prepare('INSERT INTO sync_state (key, value, updated_at) VALUES (?, ?, 1)');
    insertState.run('pull_cursor', '2026-09-19T10:00:00.123456+00:00');
    insertState.run('last_success_at', '5');
    insertState.run('last_error', 'x');
    insertState.run('baska_anahtar', 'kalir');

    applyMigrations(db, { from: firstNew });

    const rows = db.prepare('SELECT row_id, user_id, revision FROM outbox ORDER BY id').all();
    assert.deepEqual(rows.map((r) => ({ ...r })), [
      { row_id: 'g-a', user_id: A, revision: 1 },
      { row_id: 'g-b', user_id: B, revision: 1 },
      { row_id: 'v-a', user_id: A, revision: 1 },
      { row_id: 'yerelde-yok', user_id: null, revision: 1 },
    ]);
    const keys = db.prepare('SELECT key FROM sync_state ORDER BY key').all().map((r) => r.key);
    assert.deepEqual(keys, ['baska_anahtar']);
  });
});
