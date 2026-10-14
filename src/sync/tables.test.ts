import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BOOLEAN_COLUMNS, SYNC_TABLES, isSyncTable, toCloudRow, toLocalRow } from './tables.ts';

describe('senkron tabloları', () => {
  it('yerel-yalnız tablolar listede YOK', () => {
    for (const local of ['outbox', 'sync_state', 'fuel_prices']) {
      assert.equal(isSyncTable(local), false, local);
    }
  });

  it('tanınmayan tablo reddedilir', () => {
    assert.equal(isSyncTable('__smoke__'), false);
    assert.equal(isSyncTable(''), false);
  });

  it('boolean sütun tanımlı her tablo senkron listesinde', () => {
    for (const table of Object.keys(BOOLEAN_COLUMNS)) {
      assert.ok(isSyncTable(table), table);
    }
  });

  it('liste tekrarsız', () => {
    assert.equal(new Set(SYNC_TABLES).size, SYNC_TABLES.length);
  });
});

describe('toCloudRow', () => {
  it('SQLite 0/1 değerini boolean\'a çevirir', () => {
    const row = toCloudRow('vehicles', { id: 'a', is_active: 1, label: 'X' });
    assert.equal(row.is_active, true);

    const off = toCloudRow('vehicles', { id: 'a', is_active: 0 });
    assert.equal(off.is_active, false);
  });

  it('null boolean null kalır — false\'a düşmez', () => {
    const row = toCloudRow('vehicles', { id: 'a', is_active: null });
    assert.equal(row.is_active, null);
  });

  it('boolean olmayan sütunlara dokunmaz', () => {
    const row = toCloudRow('rides', {
      id: 'a', gross_amount_kurus: 24000, commission_bps: 0, notes: null,
    });
    assert.equal(row.gross_amount_kurus, 24000);
    assert.equal(row.commission_bps, 0);   // 0 false'a çevrilmedi
    assert.equal(row.notes, null);
  });

  it('birden fazla boolean sütun', () => {
    const row = toCloudRow('expense_categories', { is_system: 1, is_active: 0 });
    assert.equal(row.is_system, true);
    assert.equal(row.is_active, false);
  });
});

describe('toLocalRow', () => {
  it('server_updated_at ATILIR — yerelde böyle bir sütun yok', () => {
    const row = toLocalRow('rides', {
      id: 'a', server_updated_at: '2026-08-27T10:00:00+00:00', notes: null,
    });
    assert.equal('server_updated_at' in row, false);
    assert.equal(row.id, 'a');
  });

  it('boolean 0/1\'e çevrilir', () => {
    const row = toLocalRow('vehicles', { id: 'a', is_active: true });
    assert.equal(row.is_active, 1);
    assert.equal(toLocalRow('vehicles', { is_active: false }).is_active, 0);
  });

  it('null boolean null kalır', () => {
    assert.equal(toLocalRow('vehicles', { is_active: null }).is_active, null);
  });

  it('yerelde olmayan sütun atılır — buluta eklenen sütun eski istemciyi kırmaz', () => {
    const row = toLocalRow('goals', { id: 'a', target_net_kurus: 5, yeni_bulut_sutunu: 'x' },
      new Set(['id', 'target_net_kurus']));
    assert.deepEqual(row, { id: 'a', target_net_kurus: 5 });
  });

  it('gidiş-dönüş değeri korur', () => {
    const local = { id: 'a', user_id: 'u', is_active: 1, sort_order: 3, notes: null };
    const back = toLocalRow('vehicles', {
      ...toCloudRow('vehicles', local),
      server_updated_at: '2026-08-27T10:00:00+00:00',
    });
    assert.deepEqual(back, local);
  });
});
