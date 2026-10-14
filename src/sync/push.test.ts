/**
 * Gönderim testleri — gerçek `push.ts`, gerçek SQLite, taklit Supabase.
 *
 * Buradaki vakaların hepsi yaşanabilir: sürücü kaydı düzeltirken istek
 * yolda, aynı cihazda iki hesap, yerelde olmayan kimlik.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { eq } from 'drizzle-orm';
import { goals } from '@/db/schema';
import { softDeleteRow, stampNew, withOutbox } from '@/db/repo/_base';
import { pendingCount, pushOutbox, readyCount, stuckCount, clearTransientBackoff } from './push.ts';
import { FakeSupabase, testId } from '../../tools/test-supabase.ts';
import { rawTestDb, resetTestDb } from '../../tools/test-db.ts';

const A = testId(0xaaaa, 1);
const B = testId(0xbbbb, 2);

let counter = 0;

function addGoal(userId: string, amount: number, now = 1000): string {
  const stamp = { ...stampNew(userId, now), id: testId(1, counter += 1) };
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

function queueRows() {
  return rawTestDb().prepare('SELECT * FROM outbox ORDER BY id').all() as unknown as {
    id: number; row_id: string; revision: number; attempt_count: number;
    next_attempt_at: number | null;
  }[];
}

describe('gönderim sürerken yapılan düzeltme', () => {
  beforeEach(() => { resetTestDb(); counter = 0; });

  it('onay eski revizyonu silmez, düzeltme aynı turda ikinci istekle gider', async () => {
    const server = new FakeSupabase(A);
    const id = addGoal(A, 100);

    let edited = false;
    server.hooks.duringUpsert = () => {
      if (edited) return;
      edited = true;
      editGoal(id, 200, 2000);
    };
    const result = await pushOutbox(server.client(), A);

    assert.equal(server.log.filter((l) => l.startsWith('upsert')).length, 2,
      'ilk istek eski hâli taşıyordu; ikincisi düzeltmeyi götürmeli');
    assert.equal(server.row('goals', id)?.target_net_kurus, 200);
    assert.equal(result.sent, 2);
    assert.equal(queueRows().length, 0);
  });

  it('istek yoldayken yapılan SİLME de gider', async () => {
    const server = new FakeSupabase(A);
    const id = addGoal(A, 100);

    let deleted = false;
    server.hooks.duringUpsert = () => {
      if (deleted) return;
      deleted = true;
      softDeleteRow(goals, 'goals', A, id, 3000);
    };
    await pushOutbox(server.client(), A);

    assert.equal(server.row('goals', id)?.deleted_at, 3000);
    assert.equal(queueRows().length, 0);
  });

  it('aynı milisaniyedeki iki düzeltme de kaybolmaz', async () => {
    const server = new FakeSupabase(A);
    const id = addGoal(A, 100);

    let edited = false;
    server.hooks.duringUpsert = () => {
      if (edited) return;
      edited = true;
      editGoal(id, 150, 2000);
      editGoal(id, 200, 2000);
    };
    await pushOutbox(server.client(), A);

    assert.equal(server.row('goals', id)?.target_net_kurus, 200);
    assert.equal(server.row('goals', id)?.updated_at, 2000);
    assert.equal(queueRows().length, 0);
  });

  it('başarısız isteğin geri çekilmesi yeni düzeltmenin sırasını ezmez', async () => {
    const server = new FakeSupabase(A);
    const id = addGoal(A, 100);
    rawTestDb().exec('UPDATE outbox SET attempt_count = 5');

    server.hooks.upsertError = 'fetch failed';
    server.hooks.duringUpsert = () => { editGoal(id, 200, 2000); };
    const result = await pushOutbox(server.client(), A, { now: 10_000 });
    server.hooks.upsertError = null;
    server.hooks.duringUpsert = undefined;

    assert.equal(result.failed, 1);
    const [row] = queueRows();
    assert.equal(row.attempt_count, 0, 'düzeltme sayacı sıfırlamıştı');
    assert.equal(row.next_attempt_at, null, 'yeni düzeltme hemen gönderilmeli');
  });
});

describe('hesap süzgeci', () => {
  beforeEach(() => { resetTestDb(); counter = 0; });

  it('başka hesabın 400 kaydı bu hesabın gönderimini tıkamaz', async () => {
    for (let i = 0; i < 400; i += 1) addGoal(A, i + 1);
    const mine = addGoal(B, 999);

    const server = new FakeSupabase(B);
    const result = await pushOutbox(server.client(), B);

    assert.equal(result.sent, 1);
    assert.equal(server.row('goals', mine)?.target_net_kurus, 999);
    assert.equal(pendingCount(B), 0);
    assert.equal(pendingCount(A), 400, 'A geri döndüğünde kayıtları hâlâ gitmeli');
  });

  it('bir turda birden fazla parti boşaltılır', async () => {
    for (let i = 0; i < 900; i += 1) addGoal(A, i + 1);
    const server = new FakeSupabase(A);

    const result = await pushOutbox(server.client(), A);
    assert.equal(result.sent, 900);
    assert.equal(pendingCount(A), 0);
  });

  it('sayımlar hesaba göre', () => {
    addGoal(A, 1);
    addGoal(A, 2);
    addGoal(B, 3);
    rawTestDb().exec('UPDATE outbox SET attempt_count = 6, next_attempt_at = 99999 WHERE id = 1');
    rawTestDb().exec('UPDATE outbox SET attempt_count = 2, next_attempt_at = 99999 WHERE id = 2');

    assert.equal(pendingCount(A), 2);
    assert.equal(stuckCount(A), 1);
    assert.equal(stuckCount(B), 0);
    assert.equal(readyCount(A, 1000), 0);

    assert.equal(clearTransientBackoff(A), 1, 'takılı kayıt muaf');
    assert.equal(readyCount(A, 1000), 1);
  });
});

describe('yerelde satırı olmayan kuyruk girdisi', () => {
  beforeEach(() => { resetTestDb(); counter = 0; });

  it('buluttan SİLMEZ, yalnızca kuyruktan düşer', async () => {
    const server = new FakeSupabase(A);
    const id = addGoal(A, 100);
    // Bulutta aynı kimlikle bir kayıt var (başka cihazdan gelmiş olabilir).
    server.write('goals', [{ id, user_id: A, updated_at: 5, target_net_kurus: 700 }]);
    // Yerel satır yok edildi; kuyruk girdisi kaldı.
    rawTestDb().exec('DELETE FROM goals');

    const result = await pushOutbox(server.client(), A);

    assert.equal(result.dropped, 1);
    assert.equal(result.sent, 0);
    assert.deepEqual(server.deleteCalls, []);
    assert.equal(server.row('goals', id)?.target_net_kurus, 700);
    assert.equal(queueRows().length, 0);
  });

  it('sahibi yazılmamış eski girdiler sahibini alır, sahipsizler düşer', async () => {
    const server = new FakeSupabase(A);
    const id = addGoal(A, 100);
    rawTestDb().exec('UPDATE outbox SET user_id = NULL');
    rawTestDb().prepare(`INSERT INTO outbox
      (table_name, row_id, operation, attempt_count, revision, created_at)
      VALUES ('goals', 'yerelde-yok', 'upsert', 0, 1, 1)`).run();

    const result = await pushOutbox(server.client(), A);

    assert.equal(result.dropped, 1);
    assert.equal(result.sent, 1);
    assert.equal(server.row('goals', id)?.target_net_kurus, 100);
    assert.equal(queueRows().length, 0);
  });
});
