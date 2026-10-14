import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  type Announcement, addDismissed, compareVersions, isEligible, parseAnnouncementRow,
  parseDismissed, pickAnnouncement, shouldRefresh,
} from './announcements.ts';

const NOW = Date.parse('2026-10-02T12:00:00Z');
const H = 3_600_000;

const ann = (o: Partial<Announcement> = {}): Announcement => ({
  id: 'a', title: 'Başlık', body: 'Metin', severity: 'info', platform: 'all',
  minAppVersion: null, startsAt: NOW - H, endsAt: null, ...o,
});
const ctx = (o: Partial<Parameters<typeof pickAnnouncement>[1]> = {}) => ({
  platform: 'ios', appVersion: '1.2.0', now: NOW, dismissed: [], ...o,
});

describe('compareVersions', () => {
  it('sayısal karşılaştırır, metin sırasıyla değil', () => {
    assert.equal(compareVersions('1.10.0', '1.9.0'), 1);
    assert.equal(compareVersions('1.2.0', '1.10.0'), -1);
  });
  it('eksik parçalar sıfır sayılır', () => {
    assert.equal(compareVersions('1.2', '1.2.0'), 0);
    assert.equal(compareVersions('2', '1.9.9'), 1);
  });
  it('ön ek sonrası etiketi yok sayar', () => {
    assert.equal(compareVersions('1.2.0-beta.1', '1.2.0'), 0);
  });
  it('çözülemeyen sürüm null', () => {
    assert.equal(compareVersions('abc', '1.0.0'), null);
    assert.equal(compareVersions('1.0.0', ''), null);
  });
});

describe('parseAnnouncementRow', () => {
  const row = {
    id: 'x', title: ' Bakım ', body: ' Gece ', severity: 'warning', platform: 'android',
    min_app_version: '1.1.0', starts_at: '2026-10-02T10:00:00Z', ends_at: '2026-10-03T10:00:00Z',
    is_active: true,
  };
  it('geçerli satırı çevirir', () => {
    assert.deepEqual(parseAnnouncementRow(row, NOW), {
      id: 'x', title: 'Bakım', body: 'Gece', severity: 'warning', platform: 'android',
      minAppVersion: '1.1.0', startsAt: Date.parse(row.starts_at), endsAt: Date.parse(row.ends_at),
    });
  });
  it('kapalı, başlamamış ve bitmiş satırı atlar', () => {
    assert.equal(parseAnnouncementRow({ ...row, is_active: false }, NOW), null);
    assert.equal(parseAnnouncementRow({ ...row, starts_at: '2026-10-02T13:00:00Z' }, NOW), null);
    assert.equal(parseAnnouncementRow({ ...row, ends_at: '2026-10-02T12:00:00Z' }, NOW), null);
  });
  it('bozuk satırı atlar, bilinmeyen önem ve platformu varsayılana çeker', () => {
    assert.equal(parseAnnouncementRow(null, NOW), null);
    assert.equal(parseAnnouncementRow({ ...row, id: '' }, NOW), null);
    assert.equal(parseAnnouncementRow({ ...row, title: '  ' }, NOW), null);
    assert.equal(parseAnnouncementRow({ ...row, starts_at: 'dün' }, NOW), null);
    const a = parseAnnouncementRow({ ...row, severity: 'x', platform: 'web', min_app_version: ' ' }, NOW);
    assert.equal(a?.severity, 'info');
    assert.equal(a?.platform, 'all');
    assert.equal(a?.minAppVersion, null);
  });
});

describe('isEligible', () => {
  it('platform süzgeci', () => {
    assert.equal(isEligible(ann({ platform: 'android' }), ctx({ platform: 'ios' })), false);
    assert.equal(isEligible(ann({ platform: 'ios' }), ctx({ platform: 'ios' })), true);
    assert.equal(isEligible(ann({ platform: 'all' }), ctx({ platform: 'web' })), true);
    assert.equal(isEligible(ann({ platform: 'ios' }), ctx({ platform: 'web' })), false);
  });
  it('en düşük sürüm: eşit ve üstü görür, altı görmez', () => {
    const a = ann({ minAppVersion: '1.2.0' });
    assert.equal(isEligible(a, ctx({ appVersion: '1.2.0' })), true);
    assert.equal(isEligible(a, ctx({ appVersion: '1.10.0' })), true);
    assert.equal(isEligible(a, ctx({ appVersion: '1.1.9' })), false);
  });
  it('sürümümüz bilinmiyorsa sürüm şartlı duyuru görünmez, şartsız görünür', () => {
    assert.equal(isEligible(ann({ minAppVersion: '1.0.0' }), ctx({ appVersion: null })), false);
    assert.equal(isEligible(ann(), ctx({ appVersion: null })), true);
  });
  it('çözülemeyen alt sınır sürücüyü susturmaz', () => {
    assert.equal(isEligible(ann({ minAppVersion: 'yeni' }), ctx()), true);
  });
  it('yayın penceresi dışı görünmez', () => {
    assert.equal(isEligible(ann({ startsAt: NOW + H }), ctx()), false);
    assert.equal(isEligible(ann({ endsAt: NOW }), ctx()), false);
    assert.equal(isEligible(ann({ endsAt: NOW + 1 }), ctx()), true);
  });
});

describe('pickAnnouncement', () => {
  it('uygun olanların en yenisini seçer', () => {
    const eski = ann({ id: 'eski', startsAt: NOW - 5 * H });
    const yeni = ann({ id: 'yeni', startsAt: NOW - H });
    assert.equal(pickAnnouncement([eski, yeni], ctx())?.id, 'yeni');
    assert.equal(pickAnnouncement([yeni, eski], ctx())?.id, 'yeni');
  });
  it('uygun olmayan daha yeni duyuruyu atlayıp uygun olanı seçer', () => {
    const android = ann({ id: 'android', platform: 'android', startsAt: NOW - H });
    const genel = ann({ id: 'genel', startsAt: NOW - 5 * H });
    assert.equal(pickAnnouncement([android, genel], ctx({ platform: 'ios' }))?.id, 'genel');
  });
  it('en yenisi kapatıldıysa eski duyuru geri çıkmaz', () => {
    const eski = ann({ id: 'eski', startsAt: NOW - 5 * H });
    const yeni = ann({ id: 'yeni', startsAt: NOW - H });
    assert.equal(pickAnnouncement([eski, yeni], ctx({ dismissed: ['yeni'] })), null);
    assert.equal(pickAnnouncement([eski, yeni], ctx({ dismissed: ['eski'] }))?.id, 'yeni');
  });
  it('aynı anda başlayanlarda sonuç sıradan bağımsız', () => {
    const a = ann({ id: 'a' });
    const b = ann({ id: 'b' });
    assert.equal(pickAnnouncement([a, b], ctx())?.id, 'b');
    assert.equal(pickAnnouncement([b, a], ctx())?.id, 'b');
  });
  it('liste boşsa null', () => {
    assert.equal(pickAnnouncement([], ctx()), null);
  });
});

describe('kapatılanlar', () => {
  it('bozuk kayıt boş liste', () => {
    assert.deepEqual(parseDismissed(null), []);
    assert.deepEqual(parseDismissed('{'), []);
    assert.deepEqual(parseDismissed('{"a":1}'), []);
    assert.deepEqual(parseDismissed('["a",3,"b"]'), ['a', 'b']);
  });
  it('tekrarsız ekler, sınırı aşınca en eskiyi düşer', () => {
    assert.deepEqual(addDismissed(['a', 'b'], 'a'), ['b', 'a']);
    assert.deepEqual(addDismissed(['a', 'b', 'c'], 'd', 3), ['b', 'c', 'd']);
  });
});

describe('shouldRefresh', () => {
  it('ilk seferde ve süre dolunca çeker, arada çekmez', () => {
    assert.equal(shouldRefresh(null, NOW), true);
    assert.equal(shouldRefresh(NOW - 60_000, NOW), false);
    assert.equal(shouldRefresh(NOW - 5 * 60_000, NOW), true);
  });
  it('saat geri alınmışsa çeker', () => {
    assert.equal(shouldRefresh(NOW + H, NOW), true);
  });
});
