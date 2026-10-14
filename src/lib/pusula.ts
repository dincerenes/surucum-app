/**
 * PUSULA — "ne zaman, nerede çalışmalıyım" sorusunun saf mantığı.
 *
 * Veri `pusula-data.ts` içinde ve TAHMİN; buradaki fonksiyonlar kaynağı
 * bilmiyor, yalnızca `DemandModel` okuyor. v2'de sürücü kayıtlarından
 * gelen model aynı şekille gelecek ve bu dosya değişmeyecek.
 *
 * SAAT KURALI: her şey cihaz-yerel saatle (`getHours`, `getDay`) ve yerel
 * kurucularla (`new Date(y, m, d, h)`) hesaplanıyor. Milisaniye eklemek
 * yaz saati geçişinde bir saat kaydırırdı. Hermes'te `Intl` güvenilmez
 * olduğu için tarih biçimlendirme de elle.
 *
 * SÜRÜCÜ GÜNÜ 06:00'da başlıyor: Cuma gecesi 02:00'de çalışan sürücü
 * hâlâ "Cuma"sında. Şerit, pencereler ve "şu an" aynı güne bakıyor.
 */

import { WEEKDAYS_SHORT_TR, WEEKDAYS_TR } from './business-date.ts';
import { formatDuration } from './shift.ts';
import {
  type CityProfile, type HourlyProfileKey, type PusulaCity, type Season, type Zone,
  type ZoneKind, type ZoneWindow,
  PUSULA_CITIES, PUSULA_DATA, PUSULA_DATA_UPDATED, SEASON_MONTHS,
} from './pusula-data.ts';

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

/** Verinin kaynağı. v2: 'surucu' | 'karma'. */
export type PusulaSource = 'tahmin';

export const SOURCE_LABELS: Record<PusulaSource, string> = { tahmin: 'Tahmini' };

export interface DemandModel extends CityProfile {
  city: PusulaCity;
  source: PusulaSource;
  updated: string;
}

export function getDemandModel(city: PusulaCity): DemandModel {
  return { ...PUSULA_DATA[city], city, source: 'tahmin', updated: PUSULA_DATA_UPDATED };
}

// ---------------------------------------------------------------------------
// Şehir
// ---------------------------------------------------------------------------

export type CityResolution =
  | { kind: 'supported'; city: PusulaCity }
  | { kind: 'unsupported'; ownCity: string; fallback: PusulaCity }
  | { kind: 'missing'; fallback: PusulaCity };

/** Şehir seçilmemiş ya da desteklenmiyorsa en kalabalık pazar gösteriliyor. */
const FALLBACK_CITY: PusulaCity = 'İstanbul';

/** Birebir eşleşme: şehir `CITIES` listesinden seçiliyor, yazım sabit. */
export function isPusulaCity(s: string): s is PusulaCity {
  return (PUSULA_CITIES as readonly string[]).includes(s);
}

/**
 * Profildeki şehri Pusula şehrine çevirir. Desteklenmeyen şehir SESSİZCE
 * İstanbul'a düşmüyor: ekran "Bursa için henüz veri yok" diyebilsin diye
 * sürücünün kendi şehri de dönüyor.
 */
export function resolvePusulaCity(city: string | null | undefined): CityResolution {
  const own = (city ?? '').trim();
  if (own === '') return { kind: 'missing', fallback: FALLBACK_CITY };
  if (isPusulaCity(own)) return { kind: 'supported', city: own };
  return { kind: 'unsupported', ownCity: own, fallback: FALLBACK_CITY };
}

/** Şehir seçici sırası: sürücünün desteklenen şehri başta, gerisi veri sırasıyla. */
export function orderedCities(r: CityResolution): PusulaCity[] {
  if (r.kind !== 'supported') return [...PUSULA_CITIES];
  return [r.city, ...PUSULA_CITIES.filter((c) => c !== r.city)];
}

// ---------------------------------------------------------------------------
// Saat ve gün
// ---------------------------------------------------------------------------

export const DRIVER_DAY_START_HOUR = 6;

/** 0 = Pazartesi. Pzt–Per tek profil; Cuma akşamı hafta sonuna açıldığı için ayrı. */
export function profileFor(weekday0: number): HourlyProfileKey {
  if (weekday0 === 4) return 'friday';
  if (weekday0 === 5) return 'saturday';
  if (weekday0 === 6) return 'sunday';
  return 'weekday';
}

/** Takvim günü, 0 = Pazartesi … 6 = Pazar. */
export function weekdayOf(at: Date): number {
  return (at.getDay() + 6) % 7;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Bir andaki tahmini talep, 0–100. Profil TAKVİM gününden seçiliyor
 * (veri öyle yazıldı); ay çarpanı 100'ü aşırabildiği için kırpılıyor.
 */
export function demandAt(m: DemandModel, at: Date): number {
  const base = m.hourly[profileFor(weekdayOf(at))][at.getHours()] ?? 0;
  const factor = m.monthFactor[at.getMonth()] ?? 1;
  return Math.round(clamp(base * factor, 0, 100));
}

/** Yerel takvimde n gün ileri/geri; saat korunuyor, yaz saati kaydırmıyor. */
export function addLocalDays(d: Date, n: number): Date {
  return new Date(
    d.getFullYear(), d.getMonth(), d.getDate() + n,
    d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds(),
  );
}

/** İçinde bulunulan sürücü gününün başı: bugün 06:00, saat 06'dan önceyse dün 06:00. */
export function driverDayStart(at: Date): Date {
  const back = at.getHours() < DRIVER_DAY_START_HOUR ? 1 : 0;
  return new Date(at.getFullYear(), at.getMonth(), at.getDate() - back, DRIVER_DAY_START_HOUR);
}

/** Sürücü gününde saatin şerit indeksi: 06:00 → 0, 05:00 → 23. */
function stripIndexOf(at: Date): number {
  return (at.getHours() - DRIVER_DAY_START_HOUR + 24) % 24;
}

// ---------------------------------------------------------------------------
// Saat şeridi ve yoğun pencereler
// ---------------------------------------------------------------------------

export interface HourCell { hour: number; value: number; ratio: number }

/**
 * Bir sürücü gününün 24 saati: D günü 06..23, ardından D+1 günü 00..05.
 * Gece saatleri ERTESİ takvim gününün profilinden geliyor — Pazar
 * şeridinin son altı hücresi Pazartesi (weekday) profilinden.
 */
export function hourStrip(m: DemandModel, dayStart: Date): HourCell[] {
  const y = dayStart.getFullYear();
  const mo = dayStart.getMonth();
  const d = dayStart.getDate();
  const cells: HourCell[] = [];
  for (let i = 0; i < 24; i++) {
    const hour = (DRIVER_DAY_START_HOUR + i) % 24;
    const at = new Date(y, mo, d + (hour < DRIVER_DAY_START_HOUR ? 1 : 0), hour);
    const value = demandAt(m, at);
    cells.push({ hour, value, ratio: value / 100 });
  }
  return cells;
}

/** `endIdx` hariç. `toHour` = (6 + endIdx) % 24: şeridin sonuna uzanan pencere 06:00'da biter. */
export interface StripWindow { startIdx: number; endIdx: number; fromHour: number; toHour: number; peak: number }

/** Mutlak taban: çok sakin bir günde "en yoğun" saat uydurulmasın. */
const HOT_MIN = 40;
/** Zirve sayılmak için günün en yüksek saatinin en az bu oranı. */
const PEAK_MIN_RATIO = 0.65;
/** Pencere, zirvenin bu oranının üstünde kalan komşu saatlere yayılıyor. */
const HOT_SPREAD = 0.8;
/** Bir pencere en fazla bu kadar saat: "13:00–02:00" sürücüye bir şey söylemiyor. */
const HOT_MAX_LEN = 4;
/** Arada en fazla bu kadar saat olan pencereler birleşiyor... */
const HOT_MAX_GAP = 1;
/**
 * ...birleşik pencere bu kadar saati geçmedikçe. Cumartesi akşamdan gece
 * 02:00'ye kesintisiz yoğun: "18:00–02:00" doğru; ama öğleden gece
 * yarısına uzanan tek pencere bir şey söylemiyor.
 */
const HOT_MAX_MERGED = 8;
/** Ekranda en fazla bu kadar pencere; fazlası sürücüye bir şey söylemiyor. */
const HOT_MAX_WINDOWS = 3;

/**
 * Şeritteki yoğun pencereler — ZİRVE ZİRVE.
 *
 * Eskiden günün tek bir eşiği vardı (zirvenin %80–90'ı). Hafta içi sabah
 * zirvesi akşamınkinden alçak olduğu için hiç görünmüyor, Cuma gecesi de
 * akşam zirvesinin gölgesinde kalıyordu; eşik düşürülünce bu kez hafta
 * sonunun düz eğrisi 13 saatlik tek pencereye dönüyordu.
 *
 * Şimdi her yerel zirve kendi penceresini açıyor: zirve günün en
 * yükseğinin %65'ini (ve 40'ı) geçmeli; pencere zirveden iki yana, kendi
 * zirvesinin %80'inin üstünde kalan ve zirveden uzaklaştıkça yükselmeyen
 * saatlere, en fazla 4 saat büyüyor (her adımda yüksek olan komşu).
 * Arada en fazla 1 saat olan pencereler, birleşince 8 saati geçmiyorsa
 * birleşiyor. En yüksek zirveli ilk
 * 3 (eşitlikte erken olan) zamana göre sıralanıyor.
 */
export function hotWindows(values: readonly number[], startHour: number = DRIVER_DAY_START_HOUR): StripWindow[] {
  const n = values.length;
  if (n === 0) return [];
  const max = Math.max(...values);
  if (max < HOT_MIN) return [];
  const peakFloor = Math.max(HOT_MIN, PEAK_MIN_RATIO * max);

  const grown: { start: number; end: number; peak: number }[] = [];
  for (let p = 0; p < n; p++) {
    const v = values[p];
    const isPeak = (p === 0 || v >= values[p - 1]) && (p === n - 1 || v > values[p + 1]);
    if (!isPeak || v < peakFloor) continue;

    const floor = HOT_SPREAD * v;
    let start = p;
    let end = p + 1;
    while (end - start < HOT_MAX_LEN) {
      const l = start - 1;
      const lv = l >= 0 && values[l] >= floor && values[l] <= values[l + 1] ? values[l] : -1;
      const rv = end < n && values[end] >= floor && values[end] <= values[end - 1] ? values[end] : -1;
      if (lv < 0 && rv < 0) break;
      if (rv > lv) end += 1;
      else start -= 1;
    }
    grown.push({ start, end, peak: v });
  }

  const merged: { start: number; end: number; peak: number }[] = [];
  for (const w of grown.sort((a, b) => a.start - b.start)) {
    const last = merged[merged.length - 1];
    if (last && w.start - last.end <= HOT_MAX_GAP && Math.max(last.end, w.end) - last.start <= HOT_MAX_MERGED) {
      last.end = Math.max(last.end, w.end);
      last.peak = Math.max(last.peak, w.peak);
    } else {
      merged.push({ ...w });
    }
  }

  return merged
    .map(({ start, end, peak }): StripWindow => ({
      startIdx: start,
      endIdx: end,
      fromHour: (startHour + start) % 24,
      toHour: (startHour + end) % 24,
      peak,
    }))
    .sort((a, b) => b.peak - a.peak || a.startIdx - b.startIdx)
    .slice(0, HOT_MAX_WINDOWS)
    .sort((a, b) => a.startIdx - b.startIdx);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function clock(hour: number): string {
  return `${pad2(hour % 24)}:00`;
}

/** "17:00–20:00", gece yarısını geçen "23:00–03:00", 24 → "00:00". En dash. */
export function formatWindow(w: { fromHour: number; toHour: number }): string {
  return `${clock(w.fromHour)}–${clock(w.toHour)}`;
}

/** Türkçe liste: '', 'a', 'a ve b', 'a, b ve c'. */
export function listTr(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} ve ${items[items.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Şu an
// ---------------------------------------------------------------------------

export type DemandLevel = 0 | 1 | 2 | 3;

export const LEVEL_LABELS = ['Sakin', 'Hareketli', 'Yoğun', 'Çok yoğun'] as const;

export function levelFor(value: number): DemandLevel {
  if (value < 30) return 0;
  if (value < 55) return 1;
  if (value < 80) return 2;
  return 3;
}

export interface NowState {
  value: number;
  level: DemandLevel;
  current: StripWindow | null;
  /** `weekday`: pencerenin ait olduğu sürücü gününün adı için (0 = Pazartesi). */
  next: { window: StripWindow; tomorrow: boolean; weekday: number } | null;
}

function stripWindows(m: DemandModel, dayStart: Date): StripWindow[] {
  return hotWindows(hourStrip(m, dayStart).map((c) => c.value));
}

/**
 * Şu anki talep ve pencereler. Pencereler şeritle AYNI hesaptan
 * (`hotWindows(hourStrip(driverDayStart(now)))`): kart ile şerit farklı
 * saat söylerse sürücü ikisine de güvenmez. Bugün pencere kalmadıysa
 * sıradaki, ertesi sürücü gününün ilk penceresi.
 */
export function nowState(m: DemandModel, now: Date): NowState {
  const value = demandAt(m, now);
  const start = driverDayStart(now);
  const idx = stripIndexOf(now);
  const today = stripWindows(m, start);

  const current = today.find((w) => w.startIdx <= idx && idx < w.endIdx) ?? null;
  const laterToday = today.find((w) => w.startIdx > idx);
  let next: NowState['next'] = null;
  if (laterToday) {
    next = { window: laterToday, tomorrow: false, weekday: weekdayOf(start) };
  } else {
    const nextStart = addLocalDays(start, 1);
    const first = stripWindows(m, nextStart)[0];
    if (first) next = { window: first, tomorrow: true, weekday: weekdayOf(nextStart) };
  }
  return { value, level: levelFor(value), current, next };
}

// ---------------------------------------------------------------------------
// Hafta
// ---------------------------------------------------------------------------

export interface DayRank { index: number; value: number; ratio: number }

/** Günler Pazartesi'den; ratio = değer / haftanın en yoğun günü. */
export function weekRanks(m: DemandModel): DayRank[] {
  const max = Math.max(...m.dayOfWeek);
  return m.dayOfWeek.map((value, index) => ({ index, value, ratio: max > 0 ? value / max : 0 }));
}

/** En yoğun n gün (eşitlikte küçük indeks), gün sırasıyla. */
export function bestDays(m: DemandModel, n: number = 2): number[] {
  return m.dayOfWeek
    .map((value, index) => ({ value, index }))
    .sort((a, b) => b.value - a.value || a.index - b.index)
    .slice(0, n)
    .map((d) => d.index)
    .sort((a, b) => a - b);
}

/** En sakin gün; eşitlikte küçük indeks. */
export function quietestDay(m: DemandModel): number {
  let best = 0;
  m.dayOfWeek.forEach((v, i) => {
    if (v < m.dayOfWeek[best]) best = i;
  });
  return best;
}

// ---------------------------------------------------------------------------
// Bölgeler
// ---------------------------------------------------------------------------

export function isInSeason(s: Season, month0: number): boolean {
  return SEASON_MONTHS[s].includes(month0);
}

function wraps(w: ZoneWindow): boolean {
  return w.toHour <= w.fromHour;
}

function isoWeekday(at: Date): number {
  return weekdayOf(at) + 1;
}

/**
 * Pencere şu an açıksa bu açılışın başı ve sonu. Gece yarısını geçen
 * pencere BAŞLADIĞI güne ait: `{ Cuma, 22 → 03 }` Cumartesi 01:00'de de
 * açık, ama Cumartesi 23:00'te değil. Bu yüzden iki olasılık bakılıyor:
 * bugün başlamış, ya da dün başlayıp hâlâ sürüyor.
 */
export function activeOccurrence(w: ZoneWindow, at: Date): { start: Date; end: Date } | null {
  const y = at.getFullYear();
  const mo = at.getMonth();
  const d = at.getDate();
  const h = at.getHours();
  const wd = isoWeekday(at);
  const days = w.days as readonly number[];

  if (days.includes(wd) && h >= w.fromHour && (wraps(w) || h < w.toHour)) {
    return {
      start: new Date(y, mo, d, w.fromHour),
      end: new Date(y, mo, d + (wraps(w) ? 1 : 0), w.toHour),
    };
  }
  const prevWd = wd === 1 ? 7 : wd - 1;
  if (wraps(w) && days.includes(prevWd) && h < w.toHour) {
    return { start: new Date(y, mo, d - 1, w.fromHour), end: new Date(y, mo, d, w.toHour) };
  }
  return null;
}

export type ZoneStatus = 'active' | 'later' | 'other';

export interface ZoneView {
  zone: Zone;
  status: ZoneStatus;
  intensity: 1 | 2 | 3;
  window: ZoneWindow | null;
  start: Date | null;
  end: Date | null;
}

function maxIntensity(ws: readonly ZoneWindow[]): 1 | 2 | 3 {
  return ws.reduce<1 | 2 | 3>((a, w) => (w.intensity > a ? w.intensity : a), 1);
}

function viewOf(zone: Zone, now: Date, limit: Date): ZoneView {
  // Şu an açık: aynı anda birden çok pencere açıksa en yoğunu.
  let active: ZoneView | null = null;
  for (const w of zone.windows) {
    const occ = activeOccurrence(w, now);
    if (occ && (!active || w.intensity > active.intensity)) {
      active = { zone, status: 'active', intensity: w.intensity, window: w, ...occ };
    }
  }
  if (active) return active;

  // Bu sürücü günü içinde (bir sonraki 06:00'dan önce) açılacak: en erken olanı.
  let later: ZoneView | null = null;
  for (const w of zone.windows) {
    for (const offset of [0, 1]) {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, w.fromHour);
      if (!(w.days as readonly number[]).includes(isoWeekday(start))) continue;
      if (start <= now || start >= limit) continue;
      if (later && later.start && later.start <= start) continue;
      const end = new Date(
        start.getFullYear(), start.getMonth(), start.getDate() + (wraps(w) ? 1 : 0), w.toHour,
      );
      later = { zone, status: 'later', intensity: w.intensity, window: w, start, end };
    }
  }
  if (later) return later;

  return { zone, status: 'other', intensity: maxIntensity(zone.windows), window: null, start: null, end: null };
}

const STATUS_ORDER: Record<ZoneStatus, number> = { active: 0, later: 1, other: 2 };

/**
 * Sezonu dışındaki bölgeler atılıyor (Ocak'ta plaj önermiyoruz). Sıra:
 * şu an açık olanlar (yoğunluğa göre), bu sürücü günü içinde açılacaklar
 * (başlangıca göre), gerisi (en yüksek yoğunluğa göre). Eşitlikte veri
 * sırası — veri zaten önem sırasıyla yazıldı.
 */
export function zonesAt(m: DemandModel, now: Date): ZoneView[] {
  const limit = addLocalDays(driverDayStart(now), 1);
  const month = now.getMonth();
  return m.zones
    .filter((z) => isInSeason(z.season, month))
    .map((z, order) => ({ view: viewOf(z, now, limit), order }))
    .sort((a, b) => {
      const s = STATUS_ORDER[a.view.status] - STATUS_ORDER[b.view.status];
      if (s !== 0) return s;
      if (a.view.status === 'later') {
        const t = (a.view.start?.getTime() ?? 0) - (b.view.start?.getTime() ?? 0);
        if (t !== 0) return t;
      } else if (a.view.intensity !== b.view.intensity) {
        return b.view.intensity - a.view.intensity;
      }
      return a.order - b.order;
    })
    .map((x) => x.view);
}

/**
 * Gün listesi: 'Her gün', 'Hafta içi' (Pzt–Cum), 'Hafta sonu'; üç ve
 * daha uzun ardışık dizi 'Pzt–Per', kısa olanlar virgülle ('Cum, Cmt').
 * Karışık listede ikisi birlikte: 'Pzt–Per, Paz'.
 */
export function formatDays(days: readonly number[]): string {
  const ds = [...new Set(days)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  const key = ds.join(',');
  if (ds.length === 7) return 'Her gün';
  if (key === '1,2,3,4,5') return 'Hafta içi';
  if (key === '6,7') return 'Hafta sonu';

  const name = (d: number) => WEEKDAYS_SHORT_TR[d - 1];
  const parts: string[] = [];
  let i = 0;
  while (i < ds.length) {
    let j = i;
    while (j + 1 < ds.length && ds[j + 1] === ds[j] + 1) j++;
    if (j - i >= 2) parts.push(`${name(ds[i])}–${name(ds[j])}`);
    else for (let k = i; k <= j; k++) parts.push(name(ds[k]));
    i = j + 1;
  }
  return parts.join(', ');
}

/** En fazla iki pencere: "Hafta içi 07:00–10:00 · Cum, Cmt 22:00–03:00", fazlası " · +1". */
export function formatZoneWindows(ws: readonly ZoneWindow[]): string {
  const shown = ws.slice(0, 2).map((w) => `${formatDays(w.days)} ${formatWindow(w)}`);
  const rest = ws.length - shown.length;
  return rest > 0 ? `${shown.join(' · ')} · +${rest}` : shown.join(' · ');
}

export const ZONE_KIND_LABELS: Record<ZoneKind, string> = {
  havalimani: 'Havalimanı',
  'otogar-gar': 'Otogar / gar',
  'is-merkezi': 'İş merkezi',
  'eglence-gece': 'Gece hayatı',
  alisveris: 'Alışveriş',
  universite: 'Kampüs',
  turistik: 'Turistik',
  hastane: 'Hastane',
  sahil: 'Sahil',
  'konut-yogun': 'Konut bölgesi',
  etkinlik: 'Etkinlik',
  diger: 'Diğer',
};

// ---------------------------------------------------------------------------
// Ekran özeti
// ---------------------------------------------------------------------------

export interface DayOption { offset: number; label: string; fullName: string; start: Date }

/** Bugünden itibaren 7 sürücü günü. 02:00'de "Bugün" hâlâ dünün 06:00'ında başlıyor. */
export function dayOptions(now: Date): DayOption[] {
  const base = driverDayStart(now);
  const out: DayOption[] = [];
  for (let offset = 0; offset < 7; offset++) {
    const start = addLocalDays(base, offset);
    const wd = weekdayOf(start);
    const label = offset === 0 ? 'Bugün' : offset === 1 ? 'Yarın' : WEEKDAYS_SHORT_TR[wd];
    out.push({ offset, label, fullName: WEEKDAYS_TR[wd], start });
  }
  return out;
}

export interface PusulaSnapshot {
  source: PusulaSource;
  updated: string;
  now: NowState;
  days: DayOption[];
  day: { option: DayOption; cells: HourCell[]; windows: StripWindow[]; nowIndex: number | null };
  week: { ranks: DayRank[]; best: number[]; quietest: number; todayIndex: number };
  zones: ZoneView[];
}

/** Ekranın tek girdisi. `dayOffset` 0–6 dışındaysa en yakın uca çekiliyor. */
export function pusulaSnapshot(m: DemandModel, now: Date, dayOffset: number): PusulaSnapshot {
  const days = dayOptions(now);
  const offset = clamp(Math.round(dayOffset) || 0, 0, days.length - 1);
  const option = days[offset];
  const cells = hourStrip(m, option.start);
  return {
    source: m.source,
    updated: m.updated,
    now: nowState(m, now),
    days,
    day: {
      option,
      cells,
      windows: hotWindows(cells.map((c) => c.value)),
      nowIndex: offset === 0 ? stripIndexOf(now) : null,
    },
    week: {
      ranks: weekRanks(m),
      best: bestDays(m),
      quietest: quietestDay(m),
      todayIndex: weekdayOf(driverDayStart(now)),
    },
    zones: zonesAt(m, now),
  };
}

// ---------------------------------------------------------------------------
// Cümleler — saatten sonra ASLA ek gelmez. Ekin ünlüsü saatin okunuşuna
// bağlı ("20:00'ye", "21:00'e"); sabit metinde er geç yanlış çıkıyor. Saat
// hep iki noktadan sonra ya da cümlenin sonunda duruyor.
// ---------------------------------------------------------------------------

export function nowSentence(s: NowState): string {
  if (s.current) return `Yoğun saatlerin içindesin: ${formatWindow(s.current)}.`;
  if (s.next && !s.next.tomorrow) return `Sıradaki yoğun saatler: ${formatWindow(s.next.window)}.`;
  /**
   * "Yarın" değil gün adı: gece 01:00'de sürücünün "yarın"ı ertesi gün
   * ama sürücü günü hâlâ dün — "Yarın" iki okunuşa açık.
   */
  if (s.next) {
    return `Bugünün yoğun saatleri geçti. Sıradaki: ${WEEKDAYS_TR[s.next.weekday]} ${
      formatWindow(s.next.window)}.`;
  }
  return 'Önümüzdeki saatlerde belirgin bir yoğunluk beklenmiyor.';
}

export function hotHoursSentence(ws: readonly StripWindow[]): string {
  if (ws.length === 0) return 'Bu gün için belirgin bir yoğun saat beklenmiyor.';
  return `En yoğun saatler: ${listTr(ws.map(formatWindow))}.`;
}

export function hotDaysSentence(best: readonly number[], quietest: number): string {
  const quiet = WEEKDAYS_TR[quietest];
  if (best.length === 0) return `En sakin gün ${quiet}.`;
  const names = listTr(best.map((i) => WEEKDAYS_TR[i]));
  const head = best.length === 1 ? `En hareketli gün ${names}` : `En hareketli günler ${names}`;
  return `${head}; en sakin gün ${quiet}.`;
}

export function activeZonesSentence(zones: readonly ZoneView[]): string {
  const names = zones.filter((z) => z.status === 'active').slice(0, 3).map((z) => z.zone.name);
  if (names.length === 0) return 'Şu an öne çıkan bir bölge yok.';
  return `Hareketli bölgeler: ${listTr(names)}.`;
}

// ---------------------------------------------------------------------------
// Anasayfa ipucu
// ---------------------------------------------------------------------------

export interface HomeHint {
  level: DemandLevel;
  /** "Yoğun" — `LEVEL_LABELS`. */
  label: string;
  /** Bölge adları ya da sıradaki pencere. Tek satıra sığacak kadar kısa. */
  detail: string;
}

/**
 * Anasayfadaki tek satırlık Pusula özeti.
 *
 * Şu an açık bölge varsa en yoğun ikisinin ADI — sürücünün tek bakışta
 * "nereye" sorusunun cevabı. Yoksa saat: içinde bulunulan ya da bugünün
 * sıradaki yoğun penceresi. İkisi de yoksa ertesi günün penceresini
 * Anasayfa'da söylemiyoruz; o bilgi Pusula'da duruyor, burada gürültü.
 */
export function homeHint(m: DemandModel, now: Date): HomeHint {
  const s = nowState(m, now);
  const label = LEVEL_LABELS[s.level];
  const active = zonesAt(m, now).filter((z) => z.status === 'active').slice(0, 2);
  if (active.length > 0) return { level: s.level, label, detail: listTr(active.map((z) => z.zone.name)) };
  if (s.current) return { level: s.level, label, detail: `yoğun saatler ${formatWindow(s.current)}` };
  if (s.next && !s.next.tomorrow) {
    return { level: s.level, label, detail: `sıradaki yoğun saatler ${formatWindow(s.next.window)}` };
  }
  return { level: s.level, label, detail: 'bugün belirgin yoğunluk kalmadı' };
}

// ---------------------------------------------------------------------------
// Kadran ve dalga
// ---------------------------------------------------------------------------

/** `levelFor` eşikleri: her seviyenin talep aralığı [alt, üst). */
const LEVEL_BOUNDS: readonly (readonly [number, number])[] = [[0, 30], [30, 55], [55, 80], [80, 100]];

/**
 * Kadranda ibrenin yeri, 0 (en sol) – 1 (en sağ).
 *
 * Kadran dört EŞİT dilim ama seviye eşikleri eşit aralıklı değil
 * (30/55/80). Talep doğrudan 0–1'e çevrilseydi "Hareketli" bir değer
 * ibreyi "Yoğun" diliminin üstüne koyabilirdi; ibre yazan seviyeyle
 * çelişirdi. Bu yüzden önce seviyenin dilimi, sonra dilimin içinde yer.
 */
export function needleRatio(value: number): number {
  const v = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  const level = levelFor(v);
  const [lo, hi] = LEVEL_BOUNDS[level];
  const within = Math.min(1, (v - lo) / (hi - lo));
  return (level + within) / 4;
}

export interface WaveLine {
  /** Yoğun pencerenin içinde miyiz? */
  active: boolean;
  title: string;
  /** Sağdaki kısa etiket: "bitiş 20:00", "4 sa 7 dk sonra". Yoksa `null`. */
  pill: string | null;
}

/**
 * "Sıradaki dalga" satırı — kadranın altında, sürücünün asıl sorusu:
 * ne zaman çıkayım?
 *
 * Kalan süre yalnızca BUGÜNÜN penceresi için: ertesi günün penceresine
 * "19 sa sonra" demek sürücüye bir şey söylemiyor, gün adı söylüyor.
 * Saatten sonra ek yok (bkz. "Cümleler").
 */
export function waveLine(s: NowState, now: Date): WaveLine {
  if (s.current) {
    return { active: true, title: 'Yoğun saatlerin içindesin', pill: `bitiş ${clock(s.current.toHour)}` };
  }
  if (s.next && !s.next.tomorrow) {
    const ds = driverDayStart(now);
    const start = new Date(
      ds.getFullYear(), ds.getMonth(), ds.getDate(), DRIVER_DAY_START_HOUR + s.next.window.startIdx,
    );
    const minutes = Math.max(1, Math.ceil((start.getTime() - now.getTime()) / 60_000));
    return {
      active: false,
      title: `Sıradaki dalga ${formatWindow(s.next.window)}`,
      pill: `${formatDuration(minutes)} sonra`,
    };
  }
  if (s.next) {
    return {
      active: false,
      title: `Sıradaki dalga ${WEEKDAYS_TR[s.next.weekday]} ${formatWindow(s.next.window)}`,
      pill: null,
    };
  }
  return { active: false, title: 'Önümüzdeki saatlerde belirgin yoğunluk yok', pill: null };
}
