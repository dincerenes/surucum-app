import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type SetupGateInput, resolveSetupGate } from './setup-gate.ts';

const base: SetupGateInput = {
  hasVehicle: false, downloaded: false, syncFailed: false, skipWait: false,
};

describe('açılış kapısı', () => {
  it('kayıtlar indiyse ve araç varsa uygulama açılır, hata olsa bile', () => {
    assert.equal(resolveSetupGate({ ...base, downloaded: true, hasVehicle: true }), 'ready');
    assert.equal(
      resolveSetupGate({ ...base, downloaded: true, hasVehicle: true, syncFailed: true }),
      'ready',
    );
  });

  it('boş cihazda ilk iniş bitmeden kurulum AÇILMAZ — çift araç hatası', () => {
    assert.equal(resolveSetupGate(base), 'waiting');
  });

  it('araç indi ama kayıtlar inmeden uygulama AÇILMAZ — yarım rakam hatası', () => {
    assert.equal(resolveSetupGate({ ...base, hasVehicle: true }), 'waiting');
  });

  it('iniş bitti ve araç yoksa hesap yenidir, kurulum açılır', () => {
    assert.equal(resolveSetupGate({ ...base, downloaded: true }), 'setup');
  });

  it('senkron başarısızsa beklenir, sürücü isterse geçer', () => {
    assert.equal(resolveSetupGate({ ...base, syncFailed: true }), 'sync_failed');
    assert.equal(resolveSetupGate({ ...base, syncFailed: true, skipWait: true }), 'setup');
    assert.equal(
      resolveSetupGate({ ...base, hasVehicle: true, syncFailed: true }),
      'sync_failed',
    );
    assert.equal(
      resolveSetupGate({ ...base, hasVehicle: true, syncFailed: true, skipWait: true }),
      'ready',
    );
  });

  it('araç varken sürücü beklemeyi atlarsa uygulama açılır', () => {
    assert.equal(resolveSetupGate({ ...base, hasVehicle: true, skipWait: true }), 'ready');
  });
});
