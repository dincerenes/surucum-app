/**
 * Silinen kayıtların ömrü — gerçek SQLite, gerçek tur, taklit Supabase.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { addRide, createEarningSource, deleteEarningSource } from '@/db/repo';
import { enqueue } from '@/db/repo/_base';
import type { Kurus } from '@/lib/money';
import { getDb } from '@/db/client';
import {
  STALE_DEVICE_MS, TOMBSTONE_KEEP_MS, markPulled, purgeLocalTombstones,
} from './retention.ts';
import { getSyncStatus, readState } from './state.ts';
import { syncTurn } from './turn.ts';
import { FakeSupabase, cloudGoal, testId } from '../../tools/test-supabase.ts';
import { rawTestDb, resetTestDb } from '../../tools/test-db.ts';

const A = testId(0xaaaa, 1);
const B = testId(0xbbbb, 2);
const NOW = Date.UTC(2026, 9, 2, 12);
const DAY = 24 * 60 * 60 * 1000;

function insertGoal(userId: string, id: string, deletedAt: number | null, updatedAt = NOW - 200 * DAY) {
  rawTestDb().prepare(`INSERT INTO goals
    (id, user_id, created_at, updated_at, deleted_at, period, target_net_kurus, start_date)
    VALUES (?, ?, ?, ?, ?, 'daily', 100, '2026-01-01')`)
    .run(id, userId, updatedAt, updatedAt, deletedAt);
}

function queue(id: string) {
  getDb().transaction((tx) => enqueue(tx, 'goals', id, 'upsert', NOW));
}

function goalIds(userId: string): string[] {
  return rawTestDb().prepare('SELECT id FROM goals WHERE user_id = ? ORDER BY id').all(userId)
    .map((r) => String(r.id));
}

describe('cihazdaki eski silme işaretleri', () => {
  beforeEach(() => resetTestDb());

  it('buluta gitmiş eski işaret silinir; yenisi, kuyruktaki ve canlı kayıt kalır', () => {
    const old = NOW - TOMBSTONE_KEEP_MS - DAY;
    insertGoal(A, testId(1, 1), old); // silinir
    insertGoal(A, testId(1, 2), old); // kuyrukta: kalır
    queue(testId(1, 2));
    insertGoal(A, testId(1, 3), NOW - DAY); // yeni işaret: kalır
    insertGoal(A, testId(1, 4), null); // canlı: kalır
    insertGoal(B, testId(1, 5), old); // başka hesap: kalır

    assert.equal(purgeLocalTombstones(A, NOW), 1);
    assert.deepEqual(goalIds(A), [testId(1, 2), testId(1, 3), testId(1, 4)]);
    assert.deepEqual(goalIds(B), [testId(1, 5)]);
  });
});

describe('bağlı kayıtlar', () => {
  beforeEach(() => resetTestDb());

  it('canlı seferin gösterdiği silinmiş kaynak kalır, bağsız olan gider', () => {
    const old = NOW - TOMBSTONE_KEEP_MS - DAY;
    const used = createEarningSource(A, { name: 'Uber' }, old);
    const unused = createEarningSource(A, { name: 'BiTaksi' }, old);
    addRide(A, { grossAmountKurus: 50_000 as Kurus, earningSourceId: used.id }, 0, old);
    deleteEarningSource(A, used.id, old);
    deleteEarningSource(A, unused.id, old);
    rawTestDb().exec('DELETE FROM outbox');

    purgeLocalTombstones(A, NOW);
    const left = rawTestDb().prepare('SELECT id FROM earning_sources').all().map((r) => String(r.id));
    assert.deepEqual(left, [used.id]);
  });
});

describe('uzun süre çekmemiş cihaz', () => {
  beforeEach(() => resetTestDb());

  it('bulutta kalıcı silinmiş kaydı göstermeye devam etmez, kuyruktakini korur', async () => {
    const server = new FakeSupabase(A);
    const kept = testId(2, 1);
    server.write('goals', [cloudGoal(A, kept)]);

    // Cihaz bu kaydı canlı biliyor; bulut onun silme işaretini çoktan kalıcı sildi.
    insertGoal(A, testId(2, 2), null);
    // Cihazın henüz gönderemediği yeni kayıt.
    insertGoal(A, testId(2, 3), null, Date.now());
    queue(testId(2, 3));
    markPulled(A, Date.now() - STALE_DEVICE_MS - DAY);

    const outcome = await syncTurn(server.client(), A);
    assert.deepEqual(outcome.errors, []);

    assert.deepEqual(goalIds(A), [kept, testId(2, 3)].sort());
    assert.ok(server.row('goals', testId(2, 3)), 'kuyruktaki kayıt buluta gitmeli');
    assert.equal(getSyncStatus(A).downloaded, true);
    assert.ok(Number(readState(`pulled_at:${A}`)) > Date.now() - DAY);
  });

  it('yakın zamanda çekmiş cihaz baştan indirmez', async () => {
    const server = new FakeSupabase(A);
    insertGoal(A, testId(3, 1), null);
    markPulled(A, Date.now() - DAY);

    await syncTurn(server.client(), A);
    assert.deepEqual(goalIds(A), [testId(3, 1)]);
  });
});
