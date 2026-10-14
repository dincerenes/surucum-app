import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveActiveVehicle, resolveWorkingVehicle } from './vehicle-resolve.ts';

const A = { id: 'A' };
const B = { id: 'B' };
const C = { id: 'C' };

describe('resolveActiveVehicle', () => {
  it('ayardaki varsayılan listede varsa o', () => {
    assert.equal(resolveActiveVehicle([A, B], 'B'), B);
  });

  it('varsayılan pasif (listede yok) ya da boşsa listenin ilki', () => {
    assert.equal(resolveActiveVehicle([A, B], 'C'), A);
    assert.equal(resolveActiveVehicle([A, B], null), A);
    assert.equal(resolveActiveVehicle([], 'A'), null);
  });
});

describe('resolveWorkingVehicle', () => {
  it('A ile vardiya açıkken B seçilirse: kayıtlar A\'ya, B sonraki vardiyaya', () => {
    const r = resolveWorkingVehicle([A, B], 'B', A);
    assert.equal(r.working, A);
    assert.equal(r.next, B);
    assert.equal(r.diverged, true);
  });

  it('açık vardiya yoksa çalışılan araç seçili araçtır', () => {
    const r = resolveWorkingVehicle([A, B], 'B', null);
    assert.equal(r.working, B);
    assert.equal(r.next, B);
    assert.equal(r.diverged, false);
  });

  it('açık vardiya seçili araçla sürüyorsa ayrışma yok', () => {
    assert.equal(resolveWorkingVehicle([A, B], 'A', A).diverged, false);
  });

  it('açık vardiyanın aracı pasif olsa da kayıtlar ONA yazılır', () => {
    const r = resolveWorkingVehicle([A, B], 'A', C);
    assert.equal(r.working, C);
    assert.equal(r.next, A);
    assert.equal(r.diverged, true);
  });
});
