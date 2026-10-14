/**
 * Kurtarma testleri — eski senkronun buluta göndermeden düşürdüğü
 * düzeltmelerin, yeni sürümün ilk tam taramasında geri kazanılması.
 *
 * Başlangıç durumu eski hatanın bıraktığı iz: cihazda kayıt var, kuyruk
 * boş, bulut eski hâlde ya da kaydı hiç görmemiş.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { pullChanges } from './pull.ts';
import { pushOutbox } from './push.ts';
import { isRecoveryDone } from './recovery.ts';
import { syncTurn } from './turn.ts';
import { SessionChangedError, guardFrom } from './guard.ts';
import { getPullKey } from './state.ts';
import { FakeSupabase, cloudGoal, testId } from '../../tools/test-supabase.ts';
import { rawTestDb, resetTestDb } from '../../tools/test-db.ts';

const A = testId(0xaaaa, 1);
const B = testId(0xbbbb, 2);

/** Kuyruğa uğramadan, eski hatanın bıraktığı gibi yerel satır. */
function localGoal(userId: string, id: string, updatedAt: number, amount: number, deletedAt: number | null = null) {
  rawTestDb().prepare(`INSERT INTO goals
    (id, user_id, created_at, updated_at, deleted_at, period, target_net_kurus, start_date)
    VALUES (?, ?, 1, ?, ?, 'daily', ?, '2026-09-01')`).run(id, userId, updatedAt, deletedAt, amount);
}

function queued(): string[] {
  return rawTestDb().prepare('SELECT row_id FROM outbox ORDER BY row_id').all()
    .map((r) => String(r.row_id));
}

function localRow(id: string) {
  return rawTestDb().prepare('SELECT * FROM goals WHERE id = ?').get(id) as Record<string, unknown>;
}

function seenCount(): number {
  return Number((rawTestDb().prepare('SELECT count(*) AS n FROM sync_recovery_seen').get() as { n: number }).n);
}

const stale = testId(20, 1);     // bulut eski hâlde kaldı
const missing = testId(20, 2);   // bulut hiç görmedi
const older = testId(20, 3);     // bulut daha yeni — cihaz ezilmeli
const same = testId(20, 4);      // iki taraf eşit
const deleted = testId(20, 5);   // silme buluta gitmedi

function seedDivergence(server: FakeSupabase) {
  localGoal(A, stale, 200, 222);
  server.write('goals', [cloudGoal(A, stale, { updated_at: 100, target_net_kurus: 111 })]);

  localGoal(A, missing, 150, 333);

  localGoal(A, older, 100, 1);
  server.write('goals', [cloudGoal(A, older, { updated_at: 300, target_net_kurus: 444 })]);

  localGoal(A, same, 50, 5);
  server.write('goals', [cloudGoal(A, same, { updated_at: 50, target_net_kurus: 5 })]);

  localGoal(A, deleted, 400, 7, 400);
  server.write('goals', [cloudGoal(A, deleted, { updated_at: 90, target_net_kurus: 7 })]);
}

describe('ilk tam taramada kurtarma', () => {
  beforeEach(() => resetTestDb());

  it('buluta hiç gitmemiş ya da eski kalmış düzeltmeler yeniden kuyruğa girer', async () => {
    const server = new FakeSupabase(A);
    seedDivergence(server);

    const result = await pullChanges(server.client(), A);
    assert.equal(result.complete, true);
    assert.equal(result.requeued, 3);
    assert.deepEqual(queued(), [stale, missing, deleted].sort());
    assert.equal(localRow(older).target_net_kurus, 444, 'buluttaki yenisi cihazı ezer');
    assert.equal(localRow(stale).updated_at, 200, 'damgaya DOKUNULMAZ');
    assert.equal(isRecoveryDone(A), true);
    assert.equal(seenCount(), 0, 'defter temizlenir');

    await pushOutbox(server.client(), A);
    assert.equal(server.row('goals', stale)?.target_net_kurus, 222);
    assert.equal(server.row('goals', missing)?.target_net_kurus, 333);
    assert.equal(server.row('goals', deleted)?.deleted_at, 400);
  });

  it('kuyrukta bekleyen kayıt ikinci kez alınmaz', async () => {
    const server = new FakeSupabase(A);
    localGoal(A, missing, 150, 333);
    rawTestDb().prepare(`INSERT INTO outbox
      (table_name, row_id, user_id, operation, revision, attempt_count, created_at)
      VALUES ('goals', ?, ?, 'upsert', 4, 0, 1)`).run(missing, A);

    await pullChanges(server.client(), A);
    const rows = rawTestDb().prepare('SELECT revision FROM outbox').all();
    assert.deepEqual(rows.map((r) => r.revision), [4]);
  });

  it('başka hesabın yerel kayıtlarına dokunulmaz', async () => {
    const server = new FakeSupabase(A);
    localGoal(B, testId(21, 1), 10, 1);

    await pullChanges(server.client(), A);
    assert.deepEqual(queued(), []);
  });

  it('İDEMPOTENT: gönderimden sonraki turlar hiçbir şeyi yeniden kuyruğa almaz', async () => {
    const server = new FakeSupabase(A);
    seedDivergence(server);

    await syncTurn(server.client(), A);   // çekme kurtarır
    await syncTurn(server.client(), A);   // gönderim boşaltır
    assert.deepEqual(queued(), []);

    const again = await syncTurn(server.client(), A);
    assert.equal(again.pull?.requeued, 0);
    assert.deepEqual(queued(), []);
    assert.equal(server.row('goals', stale)?.target_net_kurus, 222);
  });

  it('birkaç tura yayılan ve yarıda kesilen tarama aynı sonuca varır', async () => {
    const server = new FakeSupabase(A);
    seedDivergence(server);
    // Buluttaki 40 kayıt cihazda da aynen var — hiçbiri kuyruğa girmemeli.
    for (let i = 0; i < 40; i += 1) {
      const id = testId(22, i);
      localGoal(A, id, 1, 100);
      server.write('goals', [cloudGoal(A, id)]);
    }

    const small = { pageSize: 10, maxPagesPerTable: 1 };
    const first = await pullChanges(server.client(), A, small);
    assert.equal(first.complete, false);
    assert.equal(isRecoveryDone(A), false);

    // Oturum, hedefler tablosunun isteği yoldayken değişiyor: o sayfa
    // da imleç de yazılmamalı.
    const before = getPullKey(A, 'goals');
    let switched = false;
    server.hooks.beforeSelect = (table) => { if (table === 'goals') switched = true; };
    await assert.rejects(
      pullChanges(server.client(), A, { ...small, guard: guardFrom(() => !switched) }),
      SessionChangedError,
    );
    server.hooks.beforeSelect = undefined;
    assert.deepEqual(getPullKey(A, 'goals'), before);

    let result = first;
    for (let i = 0; i < 20 && !result.complete; i += 1) {
      result = await pullChanges(server.client(), A, small);
    }
    assert.equal(result.complete, true);
    assert.equal(isRecoveryDone(A), true);
    assert.deepEqual(queued(), [stale, missing, deleted].sort());
  });
});
