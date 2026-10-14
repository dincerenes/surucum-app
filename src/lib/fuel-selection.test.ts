import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toggleFuelSelection } from './fuel-selection.ts';

describe('toggleFuelSelection', () => {
  it('benzin seçiliyken motorin seçilirse benzin kalkar', () => {
    assert.deepEqual(toggleFuelSelection(['gasoline'], 'diesel'), ['diesel']);
  });

  it('benzine LPG eklenebilir — tek birlikte seçilebilen çift', () => {
    assert.deepEqual(toggleFuelSelection(['gasoline'], 'lpg'), ['gasoline', 'lpg']);
    assert.deepEqual(toggleFuelSelection(['lpg'], 'gasoline'), ['lpg', 'gasoline']);
  });

  it('benzin + LPG seçiliyken elektrik seçilirse ikisi de kalkar', () => {
    assert.deepEqual(toggleFuelSelection(['gasoline', 'lpg'], 'electric'), ['electric']);
  });

  it('motorine LPG eklenemez', () => {
    assert.deepEqual(toggleFuelSelection(['diesel'], 'lpg'), ['lpg']);
  });

  it('çiftten biri kaldırılabilir', () => {
    assert.deepEqual(toggleFuelSelection(['gasoline', 'lpg'], 'lpg'), ['gasoline']);
  });

  it('tek seçili çipe basmak seçimi boşaltmaz', () => {
    assert.deepEqual(toggleFuelSelection(['diesel'], 'diesel'), ['diesel']);
  });
});
