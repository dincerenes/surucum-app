/**
 * Çekme testleri — gerçek `pull.ts`, gerçek SQLite, taklit Supabase.
 *
 * Her vaka, eski ortak imlecin gerçekten kaybettirdiği bir kayıt sınıfı:
 * aynı damgayı taşıyan grup, tur ortasında yazılan tablo, aynı cihazdaki
 * ikinci hesap, geç commit edilen işlem, buluta eklenen yeni sütun.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { pullChanges } from './pull.ts';
import { getPullKey, writeState } from './state.ts';
import {
  FakeSupabase, cloudGoal, cloudSettings, formatServerTime, testId,
} from '../../tools/test-supabase.ts';
import { rawTestDb, resetTestDb } from '../../tools/test-db.ts';

const A = testId(0xaaaa, 1);
const B = testId(0xbbbb, 2);

function localIds(table: string, userId: string): Set<string> {
  const rows = rawTestDb().prepare(`SELECT id FROM "${table}" WHERE user_id = ?`).all(userId);
  return new Set(rows.map((r) => String(r.id)));
}

function totalChanges(): number {
  return Number((rawTestDb().prepare('SELECT total_changes() AS n').get() as { n: number }).n);
}

/** Tek sunucu işleminde `n` hedef satırı — hepsi aynı damgayı alır. */
function writeGoals(server: FakeSupabase, userId: string, n: number, start: number): void {
  server.write('goals', Array.from({ length: n }, (_, i) => cloudGoal(userId, testId(7, start + i))));
}

async function pullUntilComplete(server: FakeSupabase, userId: string, turns = 5) {
  for (let i = 0; i < turns; i += 1) {
    const result = await pullChanges(server.client(), userId);
    assert.deepEqual(result.errors, []);
    if (result.complete) return result;
  }
  throw new Error('çekme tamamlanmadı');
}

describe('aynı damgayı taşıyan gruplar sayfa sınırında kaybolmaz', () => {
  beforeEach(() => resetTestDb());

  for (const groups of [[400, 400], [499, 2], [500, 1], [1200]]) {
    it(`${groups.join(' + ')} satır`, async () => {
      const server = new FakeSupabase(A);
      let next = 0;
      for (const n of groups) {
        writeGoals(server, A, n, next);
        next += n;
      }

      await pullUntilComplete(server, A);
      assert.deepEqual(localIds('goals', A), server.ids('goals', A));
    });
  }

  it('imleç sunucunun damgasını HAM saklar — mikrosaniye kesilmez', async () => {
    const server = new FakeSupabase(A);
    server.clockMicros += 654_321 - 123_456; // kesir: .654321 değil, sondaki sıfırsız biçim
    writeGoals(server, A, 3, 0);
    const stamp = String(server.row('goals', testId(7, 0))?.server_updated_at);

    await pullUntilComplete(server, A);
    assert.equal(getPullKey(A, 'goals').ts, stamp);
    assert.match(stamp, /\.\d{6}\+00:00$/);
  });
});

describe('tablo ve hesap başına imleç', () => {
  beforeEach(() => resetTestDb());

  it('tur ortasında, daha önce okunmuş tabloya yazılan kayıt sonraki turda gelir', async () => {
    const server = new FakeSupabase(A);
    let written = false;
    server.hooks.beforeSelect = async (table) => {
      if (table !== 'goals' || written) return;
      written = true;
      // Tablolar aynı anda okunuyor; goals'un isteği biraz gecikince
      // app_settings bu turda zaten okunmuş oluyor, goals henüz değil.
      await new Promise((resolve) => setTimeout(resolve, 20));
      server.write('app_settings', [cloudSettings(A, testId(8, 1))]);
      server.write('goals', [cloudGoal(A, testId(8, 2))]);
    };

    await pullChanges(server.client(), A);
    assert.equal(localIds('goals', A).size, 1);
    assert.equal(localIds('app_settings', A).size, 0);

    server.hooks.beforeSelect = undefined;
    await pullChanges(server.client(), A);
    assert.equal(localIds('app_settings', A).size, 1);
  });

  it('A → B → A: her hesabın geçmişi eksiksiz iner', async () => {
    const server = new FakeSupabase(A);
    server.write('goals', [cloudGoal(B, testId(9, 1))]); // B'nin ESKİ kaydı
    server.write('goals', [cloudGoal(A, testId(9, 2))]); // A'nın daha yeni kaydı

    await pullUntilComplete(server, A);

    server.sessionUser = B;
    await pullUntilComplete(server, B);
    assert.deepEqual(localIds('goals', B), new Set([testId(9, 1)]),
      'B, A\'nın imlecinden devam etseydi eski kaydını hiç görmezdi');

    // A başka cihazdan yazmaya devam etti.
    server.write('goals', [cloudGoal(A, testId(9, 3))]);
    server.sessionUser = A;
    await pullUntilComplete(server, A);
    assert.deepEqual(localIds('goals', A), new Set([testId(9, 2), testId(9, 3)]));
  });

  it('bir tablonun hatası diğer tabloları durdurmaz', async () => {
    const server = new FakeSupabase(A);
    server.write('goals', [cloudGoal(A, testId(10, 1))]);
    server.hooks.selectError = (table) => (table === 'vehicles' ? 'geçici hata' : null);

    const result = await pullChanges(server.client(), A);
    assert.equal(result.complete, false);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /^vehicles:/);
    assert.equal(localIds('goals', A).size, 1);
    assert.notEqual(getPullKey(A, 'goals').ts, getPullKey(A, 'vehicles').ts);
  });

  it('sayfa sınırına takılan tablo `complete: false` döner, sonraki çağrı kaldığı yerden sürer', async () => {
    const server = new FakeSupabase(A);
    for (let i = 0; i < 12; i += 1) writeGoals(server, A, 10, i * 10);

    const first = await pullChanges(server.client(), A, { pageSize: 25, maxPagesPerTable: 2 });
    assert.equal(first.complete, false);
    assert.equal(localIds('goals', A).size, 50);

    const rest = await pullUntilCompleteWith(server, A, { pageSize: 25, maxPagesPerTable: 2 });
    assert.equal(rest.complete, true);
    assert.deepEqual(localIds('goals', A), server.ids('goals', A));
  });

  it('geriye bakış penceresi sayfa bütçesinden büyükse de ilerler', async () => {
    const server = new FakeSupabase(A);
    server.tickMicros = 1000; // bütün satırlar aynı birkaç milisaniyede
    for (let i = 0; i < 12; i += 1) writeGoals(server, A, 10, i * 10);
    await pullUntilCompleteWith(server, A, { pageSize: 25, maxPagesPerTable: 2 });

    // Pencerede 120 satır var, bir çağrının bütçesi 50: yenisi yine gelmeli.
    for (let i = 12; i < 15; i += 1) writeGoals(server, A, 10, i * 10);
    await pullUntilCompleteWith(server, A, { pageSize: 25, maxPagesPerTable: 2 });
    assert.deepEqual(localIds('goals', A), server.ids('goals', A));
  });
});

async function pullUntilCompleteWith(
  server: FakeSupabase, userId: string, options: { pageSize: number; maxPagesPerTable: number },
) {
  for (let i = 0; i < 10; i += 1) {
    const result = await pullChanges(server.client(), userId, options);
    if (result.complete) return result;
  }
  throw new Error('çekme tamamlanmadı');
}

describe('geç commit edilen işlem', () => {
  beforeEach(() => resetTestDb());

  it('damgası imlecin gerisinde kalan satır geriye bakış penceresinde yakalanır', async () => {
    const server = new FakeSupabase(A);
    writeGoals(server, A, 1, 0);
    await pullUntilComplete(server, A);

    // Damgası 30 sn önce alınmış ama şimdi commit edilen işlem.
    const late = formatServerTime(server.clockMicros - 30_000_000);
    server.write('goals', [cloudGoal(A, testId(11, 1))], late);

    await pullUntilComplete(server, A);
    assert.equal(localIds('goals', A).has(testId(11, 1)), true);
  });

  it('pencereden eski damga yakalanmaz — belgelenmiş sınır', async () => {
    const server = new FakeSupabase(A);
    writeGoals(server, A, 1, 0);
    await pullUntilComplete(server, A);

    const tooLate = formatServerTime(server.clockMicros - 5 * 60_000_000);
    server.write('goals', [cloudGoal(A, testId(11, 2))], tooLate);

    await pullUntilComplete(server, A);
    assert.equal(localIds('goals', A).has(testId(11, 2)), false);
  });
});

describe('satırların yerele yazılması', () => {
  beforeEach(() => resetTestDb());

  it('buluta eklenen, yerelde olmayan sütun çekmeyi kırmaz', async () => {
    const server = new FakeSupabase(A);
    server.write('goals', [cloudGoal(A, testId(12, 1), { yeni_bulut_sutunu: 'x' })]);

    const result = await pullChanges(server.client(), A);
    assert.deepEqual(result.errors, []);
    assert.equal(result.complete, true);
    assert.equal(localIds('goals', A).size, 1);
  });

  it('içeriği aynı satır yeniden YAZILMAZ — ekranlar boşuna tetiklenmez', async () => {
    const server = new FakeSupabase(A);
    writeGoals(server, A, 5, 0);
    await pullUntilComplete(server, A);

    const before = totalChanges();
    const again = await pullChanges(server.client(), A);
    assert.equal(again.applied, 0);
    assert.equal(again.unchanged, 5, 'geriye bakış aynı satırları yeniden indirdi');
    assert.equal(totalChanges(), before);
  });

  it('cihazdaki daha yeni sürüm ezilmez', async () => {
    const server = new FakeSupabase(A);
    const id = testId(13, 1);
    server.write('goals', [cloudGoal(A, id, { updated_at: 5, target_net_kurus: 100 })]);
    rawTestDb().prepare(`INSERT INTO goals
      (id, user_id, created_at, updated_at, period, target_net_kurus, start_date)
      VALUES (?, ?, 1, 9, 'daily', 900, '2026-09-01')`).run(id, A);
    writeState(`recovery_v2:${A}`, 'done');

    const result = await pullChanges(server.client(), A);
    assert.equal(result.skippedStale, 1);
    const row = rawTestDb().prepare('SELECT target_net_kurus AS v FROM goals').get() as { v: number };
    assert.equal(row.v, 900);
  });

  it('boolean sütunlar 0/1 olarak yazılır', async () => {
    const server = new FakeSupabase(A);
    server.write('goals', [cloudGoal(A, testId(14, 1), { is_active: false })]);
    await pullChanges(server.client(), A);
    const row = rawTestDb().prepare('SELECT is_active AS v FROM goals').get() as { v: number };
    assert.equal(row.v, 0);
  });
});
