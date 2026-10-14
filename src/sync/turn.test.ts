/**
 * Tur testleri — gönder + çek + hesaba işaretle, oturum değişimi dahil.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { eq } from 'drizzle-orm';
import { goals } from '@/db/schema';
import { stampNew, withOutbox } from '@/db/repo/_base';
import { guardFrom } from './guard.ts';
import { getPullKey, getSyncStatus, pullKeys } from './state.ts';
import { syncTurn } from './turn.ts';
import { FakeSupabase, cloudGoal, testId } from '../../tools/test-supabase.ts';
import { rawTestDb, resetTestDb } from '../../tools/test-db.ts';

const A = testId(0xaaaa, 1);
const B = testId(0xbbbb, 2);

let counter = 0;

function addGoal(userId: string, amount: number, now = 1000): string {
  const stamp = { ...stampNew(userId, now), id: testId(3, counter += 1) };
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

function stateKeys(): string[] {
  return rawTestDb().prepare('SELECT key FROM sync_state WHERE value IS NOT NULL ORDER BY key').all()
    .map((r) => String(r.key));
}

describe('turun sonucu hesaba yazılır', () => {
  beforeEach(() => { resetTestDb(); counter = 0; });

  it('tam yedek son başarıyı yazar; başka hesap onu görmez', async () => {
    const server = new FakeSupabase(A);
    addGoal(A, 100);

    const outcome = await syncTurn(server.client(), A);
    assert.equal(outcome.ran, true);
    assert.deepEqual(outcome.errors, []);
    assert.equal(outcome.more, false);

    const status = getSyncStatus(A);
    assert.equal(typeof status.lastSuccessAt, 'number');
    assert.equal(status.lastError, null);
    assert.equal(status.pending, 0);

    assert.equal(getSyncStatus(B).lastSuccessAt, null);
  });

  it('hata son başarıyı silmez, zamanıyla birlikte ayrıca yazılır', async () => {
    const server = new FakeSupabase(A);
    await syncTurn(server.client(), A);
    const success = getSyncStatus(A).lastSuccessAt;

    addGoal(A, 100);
    server.hooks.upsertError = 'fetch failed';
    const outcome = await syncTurn(server.client(), A);

    assert.equal(outcome.errors.length, 1);
    const status = getSyncStatus(A);
    assert.equal(status.lastSuccessAt, success);
    assert.match(status.lastError?.message ?? '', /fetch failed/);
    assert.equal(typeof status.lastError?.at, 'number');
    assert.equal(status.pending, 1);
  });

  it('bekleyen kayıt varken hatasız tur da "yedeklendi" yazmaz', async () => {
    const server = new FakeSupabase(A);
    addGoal(A, 100);
    rawTestDb().exec(`UPDATE outbox SET attempt_count = 7, next_attempt_at = ${Date.now() + 60_000}`);

    const outcome = await syncTurn(server.client(), A);
    assert.deepEqual(outcome.errors, []);
    assert.equal(getSyncStatus(A).lastSuccessAt, null);
    assert.equal(getSyncStatus(A).stuck, 1);
    // Bulut sonuna kadar indi: açılış kapısı bekleyen kayıt yüzünden kapalı kalmaz.
    assert.equal(getSyncStatus(A).downloaded, true);
    assert.equal(getSyncStatus(B).downloaded, false);
  });

  it('çekme yarım kalırsa kayıtlar "indi" sayılmaz', async () => {
    const server = new FakeSupabase(A);
    server.hooks.selectError = (table) => (table === 'rides' ? 'fetch failed' : null);

    await syncTurn(server.client(), A);
    assert.equal(getSyncStatus(A).downloaded, false);

    server.hooks.selectError = undefined;
    await syncTurn(server.client(), A);
    assert.equal(getSyncStatus(A).downloaded, true);
  });

  it('tur sırasında girilen kayıt `more` döndürür, sonraki tur götürür', async () => {
    const server = new FakeSupabase(A);
    const id = addGoal(A, 100);
    await syncTurn(server.client(), A);

    let edited = false;
    server.hooks.beforeSelect = () => {
      if (edited) return;
      edited = true;
      editGoal(id, 300, 5000); // gönderim bitti, çekme sürüyor
    };
    const outcome = await syncTurn(server.client(), A);
    server.hooks.beforeSelect = undefined;
    assert.equal(outcome.more, true);

    await syncTurn(server.client(), A);
    assert.equal(server.row('goals', id)?.target_net_kurus, 300);
  });
});

describe('oturum tur ortasında değişirse', () => {
  beforeEach(() => { resetTestDb(); counter = 0; });

  it('gönderim askıdayken: onay yok, deneme sayılmaz, hiçbir durum yazılmaz', async () => {
    const server = new FakeSupabase(A);
    addGoal(A, 100);

    let session: string | null = A;
    server.hooks.duringUpsert = () => {
      session = B;
      server.sessionUser = B;
    };
    const outcome = await syncTurn(server.client(), A, { guard: guardFrom(() => session === A) });

    assert.equal(outcome.skipped, 'session_changed');
    assert.equal(outcome.more, true, 'yeni hesabın turu beklemeden açılmalı');
    const queue = rawTestDb().prepare('SELECT attempt_count, next_attempt_at FROM outbox').all();
    assert.deepEqual(queue.map((r) => ({ ...r })), [{ attempt_count: 0, next_attempt_at: null }]);
    assert.deepEqual(stateKeys(), []);
  });

  it('çekme sürerken: hiçbir imleç ilerlemez', async () => {
    const server = new FakeSupabase(A);
    server.write('goals', [cloudGoal(A, testId(4, 1))]);
    server.write('app_settings', [{
      id: testId(4, 2), user_id: A, created_at: 1, updated_at: 1, deleted_at: null,
      day_cutoff_hour: 4, default_vehicle_id: null, region_code: 'TR',
      default_earning_source_id: null, onboarding_completed_at: null,
    }]);

    let session: string | null = A;
    server.hooks.beforeSelect = (table) => {
      if (table === 'vehicles') session = null; // çıkış yapıldı
    };
    const before = pullKeys(A);
    const outcome = await syncTurn(server.client(), A, { guard: guardFrom(() => session === A) });

    assert.equal(outcome.skipped, 'session_changed');
    // app_settings tamamlanmıştı; oturum değiştikten sonra hiçbir şey yazılmadı.
    assert.deepEqual(getPullKey(A, 'goals'), before.goals);
    assert.deepEqual(getPullKey(A, 'vehicles'), before.vehicles);
    assert.equal(stateKeys().some((k) => k.startsWith('last_')), false);
  });
});
