import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { DATABASE_NAME, createChangeBatcher, isOwnDatabaseEvent } from './change-events.ts';

const PATH = `/var/mobile/Containers/Data/Application/ABC/Documents/SQLite/${DATABASE_NAME}`;

describe('isOwnDatabaseEvent', () => {
  it('kendi veritabanımızın olayını geçirir', () => {
    assert.equal(
      isOwnDatabaseEvent({ databaseName: 'main', databaseFilePath: PATH }),
      true,
    );
  });

  /**
   * ASIL KORUNAN DAVRANIŞ.
   *
   * `databaseName` her zaman `"main"` gelir. Süzgeç ona bakarsa hiçbir
   * olay geçmez ve arayüz sessizce donar — vardiya kapanır, ekran hâlâ
   * "canlı vardiya" gösterir. Bu bir kez yaşandı.
   */
  it("mantıksal ad 'main' olsa da eleme yapmaz", () => {
    assert.equal(
      isOwnDatabaseEvent({ databaseName: 'main', databaseFilePath: PATH }),
      true,
    );
    assert.equal(
      isOwnDatabaseEvent({ databaseName: DATABASE_NAME, databaseFilePath: PATH }),
      true,
    );
  });

  it('başka bir veritabanının olayını eler', () => {
    assert.equal(
      isOwnDatabaseEvent({ databaseName: 'main', databaseFilePath: '/tmp/sinama.db' }),
      false,
    );
  });

  /** Yol yoksa geçirilir: fazladan okuma, kaçırılan güncellemeden ucuzdur. */
  it('dosya yolu boşsa geçirir', () => {
    assert.equal(isOwnDatabaseEvent({ databaseName: 'main' }), true);
    assert.equal(isOwnDatabaseEvent({ databaseFilePath: null }), true);
    assert.equal(isOwnDatabaseEvent({ databaseFilePath: '' }), true);
  });
});

describe('createChangeBatcher', () => {
  function manual() {
    const queue: (() => void)[] = [];
    return { queue, schedule: (run: () => void) => { queue.push(run); } };
  }

  it('art arda gelen olaylar her aboneye TEK bildirim olur', () => {
    const clock = manual();
    const batcher = createChangeBatcher(clock.schedule);
    let calls = 0;
    batcher.subscribe(() => { calls += 1; });

    for (let i = 0; i < 600; i += 1) batcher.notify();
    assert.equal(clock.queue.length, 1);
    assert.equal(calls, 0);

    clock.queue.shift()!();
    assert.equal(calls, 1);
  });

  it('bildirimden sonra gelen olay yeni bir pencere açar — değişiklik kaçmaz', () => {
    const clock = manual();
    const batcher = createChangeBatcher(clock.schedule);
    let calls = 0;
    batcher.subscribe(() => { calls += 1; });

    batcher.notify();
    clock.queue.shift()!();
    batcher.notify();
    assert.equal(clock.queue.length, 1);
    clock.queue.shift()!();
    assert.equal(calls, 2);
  });

  it('aboneliği bırakan ekran çağrılmaz', () => {
    const clock = manual();
    const batcher = createChangeBatcher(clock.schedule);
    let calls = 0;
    const stop = batcher.subscribe(() => { calls += 1; });
    batcher.notify();
    stop();
    clock.queue.shift()!();
    assert.equal(calls, 0);
  });
});
