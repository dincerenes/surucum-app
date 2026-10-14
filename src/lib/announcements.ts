/**
 * Uygulama içi duyuru bandının saf mantığı — hangi duyuru, kime, ne zaman.
 *
 * Kullanım koşulları ve gizlilik politikası "önemli değişiklikleri uygulama
 * içinde duyururuz" diyor; bu dosya o vaadin karar kısmı. Ağ, depolama ve
 * arayüz bilmiyor, bu yüzden test ediliyor (`announcements.test.ts`).
 *
 * Kaynak: Supabase `public.announcements`. Satırı RLS zaten yalnızca
 * yayındakilere indiriyor ama BURADA DA süzülüyor: yönetici hesabı RLS'te
 * taslakları da görüyor ve yönetici sürücü olarak uygulamayı açabilir.
 */

export const ANNOUNCEMENT_SEVERITIES = ['info', 'warning', 'critical'] as const;
export type AnnouncementSeverity = (typeof ANNOUNCEMENT_SEVERITIES)[number];

export type AnnouncementPlatform = 'all' | 'ios' | 'android';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  severity: AnnouncementSeverity;
  platform: AnnouncementPlatform;
  /** Boşsa sürüm ayrımı yok; doluysa yalnızca bu sürüm ve üstü görür. */
  minAppVersion: string | null;
  startsAt: number;
  endsAt: number | null;
}

/** Sunucudan çekmeler arası en az süre: açılışta ve her odaklanmada istek atılmasın. */
export const ANNOUNCEMENT_REFRESH_MS = 5 * 60_000;

/** Kapatılan duyuru kimlikleri cihazda tutulur; eskiler şişirmesin diye sınır. */
export const MAX_DISMISSED = 50;

/** `device_prefs` anahtarı. */
export const DISMISSED_PREF_KEY = 'dismissed_announcements';

const PLATFORMS: readonly AnnouncementPlatform[] = ['all', 'ios', 'android'];

function toMs(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Sunucudan gelen ham satırı doğrular. Bozuk satır `null`: bir duyuru
 * yüzünden ana ekran çökmemeli, bozuk olan sessizce atlanır.
 * Yayın penceresi dışındaki ya da kapalı (`is_active` false) satır da `null`.
 */
export function parseAnnouncementRow(raw: unknown, now: number): Announcement | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;

  if (typeof r.id !== 'string' || r.id === '') return null;
  if (typeof r.title !== 'string' || r.title.trim() === '') return null;
  if (typeof r.body !== 'string' || r.body.trim() === '') return null;
  if (r.is_active === false) return null;

  const severity = (ANNOUNCEMENT_SEVERITIES as readonly unknown[]).includes(r.severity)
    ? (r.severity as AnnouncementSeverity)
    : 'info';
  const platform = (PLATFORMS as readonly unknown[]).includes(r.platform)
    ? (r.platform as AnnouncementPlatform)
    : 'all';

  const startsAt = toMs(r.starts_at);
  if (startsAt == null || startsAt > now) return null;
  const endsAt = toMs(r.ends_at);
  if (endsAt != null && endsAt <= now) return null;

  return {
    id: r.id,
    title: r.title.trim(),
    body: r.body.trim(),
    severity,
    platform,
    minAppVersion: typeof r.min_app_version === 'string' && r.min_app_version.trim() !== ''
      ? r.min_app_version.trim() : null,
    startsAt,
    endsAt,
  };
}

/** "1.2.3" → [1, 2, 3]. Sayısal olmayan ya da boş sürüm `null`. "1.2.3-beta" → [1, 2, 3]. */
function versionParts(version: string): number[] | null {
  const core = version.trim().split(/[-+\s]/)[0];
  if (!/^\d+(\.\d+)*$/.test(core)) return null;
  return core.split('.').map(Number);
}

/**
 * Sürüm karşılaştırması: a < b ise -1, eşitse 0, a > b ise 1. Eksik
 * parçalar sıfır sayılır ("1.2" = "1.2.0"). Biri çözülemezse `null`.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const pa = versionParts(a);
  const pb = versionParts(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export interface AnnouncementContext {
  /** `Platform.OS`; 'ios' ve 'android' dışındaki bir değerde yalnızca 'all' duyurular görünür. */
  platform: string;
  /** Uygulamanın sürümü (`app.json` → `version`). Bilinmiyorsa `null`. */
  appVersion: string | null;
  now: number;
  /** Sürücünün bu cihazda kapattığı duyuru kimlikleri. */
  dismissed: readonly string[];
}

/** Duyuru bu platformda ve bu sürümde gösterilebilir mi? (Kapatılmış mı bakmaz.) */
export function isEligible(a: Announcement, ctx: Pick<AnnouncementContext, 'platform' | 'appVersion' | 'now'>): boolean {
  if (a.startsAt > ctx.now) return false;
  if (a.endsAt != null && a.endsAt <= ctx.now) return false;
  if (a.platform !== 'all' && a.platform !== ctx.platform) return false;

  if (a.minAppVersion != null) {
    // Sürümümüz bilinmiyorsa "yeni sürümde" varsayımı yapılamaz: gösterme.
    if (ctx.appVersion == null) return false;
    // Çözülemeyen alt sınır yönetici hatası; sürücüyü susturmasın, göster.
    const cmp = compareVersions(ctx.appVersion, a.minAppVersion);
    if (cmp != null && cmp < 0) return false;
  }
  return true;
}

/**
 * Bantta gösterilecek duyuru: uygun olanların EN YENİSİ (`startsAt`,
 * eşitlikte kimlik sırası). En yenisi kapatıldıysa hiçbir şey gösterilmez —
 * kapatınca eski bir duyuru geri çıkmasın.
 */
export function pickAnnouncement(
  rows: readonly Announcement[], ctx: AnnouncementContext,
): Announcement | null {
  let newest: Announcement | null = null;
  for (const a of rows) {
    if (!isEligible(a, ctx)) continue;
    if (newest == null || a.startsAt > newest.startsAt
      || (a.startsAt === newest.startsAt && a.id > newest.id)) {
      newest = a;
    }
  }
  if (newest == null || ctx.dismissed.includes(newest.id)) return null;
  return newest;
}

/** Cihazda saklanan kapatılmış kimlikler. Bozuk kayıt boş liste: bant yeniden görünür, uygulama çökmez. */
export function parseDismissed(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Kimliği listeye ekler (tekrarsız); sınır aşılırsa en eskiler düşer. */
export function addDismissed(list: readonly string[], id: string, max = MAX_DISMISSED): string[] {
  const next = [...list.filter((x) => x !== id), id];
  return next.length > max ? next.slice(next.length - max) : next;
}

/** Son başarılı çekmeden beri yeterli süre geçti mi? Hiç çekilmediyse evet. */
export function shouldRefresh(
  lastFetchedAt: number | null, now: number, minIntervalMs = ANNOUNCEMENT_REFRESH_MS,
): boolean {
  if (lastFetchedAt == null) return true;
  // Saat geri alınmışsa (negatif fark) beklemek yerine çek.
  const elapsed = now - lastFetchedAt;
  return elapsed < 0 || elapsed >= minIntervalMs;
}
