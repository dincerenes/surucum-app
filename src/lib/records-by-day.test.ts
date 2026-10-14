import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { groupRecordsByDay } from './records-by-day.ts';
import { type BusinessDate, asBusinessDate } from './business-date.ts';

const d = (s: string) => asBusinessDate(s);
const entry = (date: string, at: number, id: string) => ({ date: d(date), entry: { id, at } });
const shift = (date: string, id: string) => ({ businessDate: d(date) as BusinessDate, id });

describe('groupRecordsByDay', () => {
  it('yalnızca kapanmış vardiyası olan gün GÖRÜNÜR, girdileri boş', () => {
    const days = groupRecordsByDay([], [shift('2026-09-18', 's1')]);
    assert.deepEqual(days, [{ date: '2026-09-18', entries: [], shifts: [{ businessDate: '2026-09-18', id: 's1' }] }]);
  });

  it('karışık günlerde anahtarlar birleşir, tekrar yok, yeniden eskiye', () => {
    const days = groupRecordsByDay(
      [entry('2026-09-16', 5, 'r1'), entry('2026-09-18', 1, 'r2'), entry('2026-09-18', 9, 'g1')],
      [shift('2026-09-18', 's1'), shift('2026-09-17', 's2')],
    );
    assert.deepEqual(days.map((x) => x.date), ['2026-09-18', '2026-09-17', '2026-09-16']);
    assert.deepEqual(days[0].entries.map((e) => e.id), ['g1', 'r2'], 'girdiler yeniden eskiye');
    assert.deepEqual(days[0].shifts.map((s) => s.id), ['s1']);
    assert.deepEqual(days[1].entries, []);
  });

  it('boş girdi boş liste', () => {
    assert.deepEqual(groupRecordsByDay([], []), []);
  });
});
