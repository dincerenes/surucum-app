/**
 * Bir iş gününün özeti — üç satırın gerçek kayıtlardan üretildiği yer.
 *
 * Veritabanı bilmez: satırları alır, sayı üretir. Okuma sorguları
 * `src/db/repo/summary.ts` içinde; bu modül yalnızca aritmetik yapar ki
 * native SQLite kurmadan test edilebilsin.
 *
 * KİLOMETRE burada topluca ele alınıyor: bir iş gününde birden fazla
 * vardiya olabilir ve bazılarının kilometresi girilmemiş olabilir.
 * Girilmemiş olanı TAHMİN ETMİYORUZ — bilinen kilometreleri topluyor,
 * eksik vardiya sayısını ayrıca bildiriyoruz. Yıpranma payı o zaman
 * eksik hesaplanır ve arayüz bunu söylemek zorundadır.
 *
 * EKSİKLİK TUTARDAN BAĞIMSIZ bildiriliyor (`completeness`): "yakıt 0 ₺"
 * ile "yakıt bilinmiyor" aynı şey değil. Tutara bakarak uyarı üretmek,
 * yakıtı hiç bilinmeyen günü sessizce yakıtsız gösteriyordu.
 */

import { type Kurus, ZERO, add, multiply, sum } from './money.ts';
import { calculateFuelCost, calculateFuelVolume } from './fuel-cost.ts';
import { type ProfitBreakdown, calculateProfit } from './profit.ts';
import {
  type ShiftTiming, type UnixMs, normalizeDistance, resolveShiftDuration,
  earningsPerHour, earningsPerKm, earningsPerRide,
} from './shift.ts';

/** Özetin sefer kayıtlarından ihtiyaç duyduğu alanlar. */
export interface RideRow {
  grossAmountKurus: Kurus;
  commissionKurus: Kurus;
  tipKurus: Kurus;
}

export interface AmountRow {
  amountKurus: Kurus;
}

/**
 * Dolum satırı. `shiftId` dolum açık bir vardiyada girildiyse o vardiya;
 * `vehicleId` vardiyasız dolumu aynı günün aynı araçlı vardiyasıyla
 * eşlemek için. `id` yalnızca arayüzün hangi dolumun sayılmadığını
 * gösterebilmesi için.
 */
export interface FuelRow {
  id?: string;
  shiftId?: string | null;
  vehicleId?: string | null;
  totalAmountKurus: Kurus;
}

/**
 * Vardiya satırı — süre/mesafe alanlarına yıpranma oranı eklenmiş.
 *
 * Oran vardiyanın kendi üzerinde taşınıyor çünkü aynı iş gününde iki
 * farklı araçla çalışılabilir ve her aracın oranı farklıdır. Boşsa
 * `DaySummaryInput.wearPerKmKurus` kullanılır.
 */
export interface ShiftRow extends ShiftTiming {
  /** Dolumun bağlandığı vardiyayı bulmak için. */
  id?: string;
  /** Vardiyasız dolumu aynı araçlı vardiyayla eşlemek için. */
  vehicleId?: string | null;

  wearPerKmKurus?: Kurus | null;

  /**
   * O gün uygulamaya ödenen komisyon — sürücünün vardiya sonunda yazdığı
   * TEK RAKAM. Sefer başına oran kullanılmıyor. Boşsa BİLİNMİYOR
   * (hesaba sıfır girer ama eksik sayılır); 0 ise gerçekten sıfır.
   */
  commissionKurus?: Kurus | null;

  /** Aracın ortalama tüketimi, 100 km başına mililitre (7,5 lt → 7500). */
  fuelConsumptionPer100Km?: number | null;

  /** O gün geçerli birim yakıt fiyatı, kuruş/litre. */
  fuelPriceKurus?: Kurus | null;
}

export interface DaySummaryInput {
  rides: readonly RideRow[];
  expenses: readonly AmountRow[];
  fuelLogs: readonly FuelRow[];

  /** O iş gününün vardiyaları. Boş olabilir — vardiyasız sefer de olur. */
  shifts?: readonly ShiftRow[];

  /** Vardiyanın kendi oranı yoksa kullanılacak yıpranma payı. */
  wearPerKmKurus?: Kurus;

  /**
   * Sabit giderin o güne düşen payı. Bu modül HESAPLAMAZ, hazır alır —
   * tahakkuk motoru `allocate()` kullanmak zorunda ve kendi modülünde.
   */
  fixedShare?: Kurus;

  now: UnixMs;
}

/**
 * Bir girdinin kapsaması — KAPANMIŞ vardiyalar üzerinden.
 *
 * - `none`: kapanmış vardiya yok; soru hiç doğmadı (yalnız gider ya da
 *   yakıt içeren gün "km eksik" sayılmaz, açık vardiya da sayılmaz —
 *   kilometresi henüz sorulmadı).
 * - `complete`: kapanmış vardiyaların hepsinde biliniyor.
 * - `partial`: bir kısmında biliniyor.
 * - `unknown`: hiçbirinde bilinmiyor.
 */
export type Coverage = 'none' | 'complete' | 'partial' | 'unknown';

/** Yakıt satırındaki tutarın nereden geldiği. */
export type FuelSource = 'none' | 'burned' | 'filled' | 'mixed';

/**
 * Bir dolumun o günün yakıtına nasıl girdiği.
 *
 * - `counted`: yakıt maliyetine girdi.
 * - `covered`: aynı vardiyanın (ya da aynı araçlı vardiyanın) yakıtı
 *   tüketimden hesaplandı; dolum AYRICA düşülmedi — aynı yakıt iki kez
 *   düşülürdü.
 * - `off_day`: o gün o araçla HİÇ vardiya yok. Depo alımı maliyete
 *   girmez, yalnızca litre fiyatı kaynağıdır: ertesi gün tüketimden
 *   hesaplanan yakıtla aynı yakıt iki kez düşülürdü.
 */
export type FuelLogStatus = 'counted' | 'covered' | 'off_day';

export interface SummaryCompleteness {
  closedShiftCount: number;
  openShiftCount: number;

  distance: Coverage;
  /** Kilometresi girilmemiş KAPANMIŞ vardiya sayısı. */
  shiftsMissingDistance: number;

  fuel: Coverage;
  fuelSource: FuelSource;
  /** Yakıtı bilinmeyen kapanmış vardiya: tüketim hesabı da dolumu da yok. */
  shiftsMissingFuel: number;
  /** O vardiyaların kimlikleri — Kayıtlar'daki rozet için. */
  fuelUnknownShiftIds: string[];
  /** Tüketimden hesaplandığı için ayrıca düşülmeyen dolumların toplamı. */
  fillsNotCountedKurus: Kurus;
  /** O gün o araçla vardiya olmadığı için hesaba girmeyen depo alımları. */
  offDayFillsKurus: Kurus;

  commission: Coverage;
  /** Komisyonu BOŞ bırakılmış kapanmış vardiya — 0 yazılmışsa eksik değil. */
  shiftsMissingCommission: number;
}

export interface DaySummary {
  profit: ProfitBreakdown;

  rideCount: number;
  expenseCount: number;
  fuelLogCount: number;

  /**
   * Günde gösterilecek bir şey var mı — sefer, gider, yakıt ya da kapanmış
   * vardiya. Yalnızca açık vardiyası olan boş gün DIŞARIDA: o gün "vardiya
   * açık, henüz kayıt yok" diyor.
   *
   * Tutara bakılmıyor: seferi olmayan ama 700 ₺ yakıt yazılmış gün de
   * özetini göstermeli; sıfır kâr "kayıt yok" demek değil.
   */
  hasActivity: boolean;

  /**
   * Çalışılan gün mü — sefer ya da kapanmış vardiya. İstatistikte gün
   * başına ortalamanın paydası. Yalnızca gider ya da depo alımı olan gün
   * çalışılmış sayılmaz; maliyeti yine de dönem toplamında kalır.
   */
  isWorkedDay: boolean;

  /** Bilinen kilometrelerin toplamı. Hiçbiri girilmemişse `null`. */
  distanceKm: number | null;
  /** Kilometresi girilmemiş kapanmış vardiya sayısı — arayüz bunu söylemeli. */
  shiftsMissingDistance: number;

  /**
   * Tüketimden hesaplanan yakıt, mililitre. Hiçbir vardiyada tüketim
   * hesabı yoksa `null` — yakıt satırı o zaman kaynağını ayrıca söyler.
   */
  fuelVolume: number | null;

  /** Tutardan bağımsız eksiklikler — uyarıların tek kaynağı. */
  completeness: SummaryCompleteness;

  /** Dolumların durumu, kimliğe göre (kimliği olmayan satır girmez). */
  fuelLogStatus: Record<string, FuelLogStatus>;

  durationMinutes: number;
  /** Süre damgalardan mı türetildi? Sürücü yazdıysa `false`. */
  isDurationEstimated: boolean;

  /** Türetilmiş oranlar "cebe kalan" üzerinden. Payda yoksa `null`. */
  perHour: Kurus | null;
  perKm: Kurus | null;
  perRide: Kurus | null;
}

/**
 * Günün üç satırını ve türetilmiş sayılarını üretir.
 *
 * Oranların payı CEBE KALAN'dır, ciro değil. Sebebi: sürücü "saat başına
 * ne kazandım" diye sorduğunda kastettiği eline geçen paradır; ciro/saat
 * komisyonu ve yakıtı yok sayar ve sürücüyü olduğundan zengin gösterir.
 */
export function calculateDaySummary(input: DaySummaryInput): DaySummary {
  const shifts = input.shifts ?? [];
  const closed = shifts.filter((s) => s.endedAt != null);
  const distance = collectDistance(shifts, input.wearPerKmKurus);
  const fuel = collectFuel(shifts, input.fuelLogs);

  const profit = calculateProfit({
    grossAmounts: input.rides.map((r) => r.grossAmountKurus),
    /**
     * Komisyon İKİ KAYNAKTAN toplanıyor: vardiya sonunda girilen tek
     * rakam (asıl yol) ve sefer kayıtlarının kendi komisyonu (v1'de
     * daima sıfır, ileride sefer başına kesinti gerekirse diye açık).
     */
    commissionAmounts: [
      ...input.rides.map((r) => r.commissionKurus),
      ...shifts.map((s) => sanitizeCommission(s.commissionKurus)),
    ],
    tips: input.rides.map((r) => r.tipKurus),
    /**
     * Yakıt TEK SAYI — ama VARDİYA BAŞINA (`collectFuel`). Tüketim
     * hesaplanabilen vardiyada tüketim × km × fiyat; hesaplanamayanda o
     * vardiyanın dolumları. İkisi birden sayılmıyor — aynı yakıt iki kez
     * düşülürdü.
     */
    fuelAmounts: [fuel.cost],
    expenseAmounts: input.expenses.map((e) => e.amountKurus),
    fixedShare: input.fixedShare ?? ZERO,
    wearShare: distance.wearShare,
    isDistanceEstimated: distance.isPartial,
  });

  const duration = collectDuration(shifts, input.now);
  const rideCount = input.rides.length;
  const commissionMissing = closed.filter((s) => s.commissionKurus == null).length;

  return {
    profit,
    rideCount,
    expenseCount: input.expenses.length,
    fuelLogCount: input.fuelLogs.length,
    hasActivity: rideCount > 0 || input.expenses.length > 0
      || input.fuelLogs.length > 0 || closed.length > 0,
    isWorkedDay: rideCount > 0 || closed.length > 0,
    distanceKm: distance.km,
    shiftsMissingDistance: distance.missing,
    fuelVolume: fuel.volume,
    completeness: {
      closedShiftCount: closed.length,
      openShiftCount: shifts.length - closed.length,
      distance: coverage(closed.length, distance.missing),
      shiftsMissingDistance: distance.missing,
      fuel: coverage(closed.length, fuel.unknownShiftCount),
      fuelSource: fuel.source,
      shiftsMissingFuel: fuel.unknownShiftCount,
      fuelUnknownShiftIds: fuel.unknownShiftIds,
      fillsNotCountedKurus: fuel.notCounted,
      offDayFillsKurus: fuel.offDay,
      commission: coverage(closed.length, commissionMissing),
      shiftsMissingCommission: commissionMissing,
    },
    fuelLogStatus: fuel.status,
    durationMinutes: duration.minutes,
    isDurationEstimated: duration.isEstimated,
    /**
     * Pay günün BÜTÜN parası; payda yalnızca BİLİNEN kısım olursa sayı
     * şişer. İki vardiyalı günde ikincinin km'si boşsa ₺/km iki katı
     * çıkıyor, gün "Harika" puan alıyor ve sonraki 30 günün normalini de
     * bozuyordu. Açık vardiyanın parası var ama süresi ve km'si yok.
     * Payda eksikse sayı YOK.
     */
    perHour: shifts.length > closed.length ? null
      : earningsPerHour(profit.cashProfit, duration.minutes),
    perKm: closed.length > 0 && closed.length === shifts.length && distance.missing === 0
      ? earningsPerKm(profit.cashProfit, distance.km) : null,
    perRide: earningsPerRide(profit.cashProfit, rideCount),
  };
}

function coverage(total: number, missing: number): Coverage {
  if (total === 0) return 'none';
  if (missing === 0) return 'complete';
  return missing >= total ? 'unknown' : 'partial';
}

/**
 * Vardiyaların kilometresini toplar.
 *
 * Eksik sayılan yalnızca KAPANMIŞ vardiya: açık vardiyanın kilometresi
 * vardiya biterken sorulacak, henüz eksik değil. Eskiden açık vardiya
 * da sayılıyor ve Anasayfa her açık vardiyada "kilometre girilmemiş"
 * uyarısı gösteriyordu.
 *
 * `isPartial`, kilometresi bilinen EN AZ BİR vardiya varken başka bir
 * kapanmış vardiyanın kilometresinin eksik olduğu durumu işaretler:
 * elimizdeki toplam gerçeğin altında kalıyor demektir. Hiçbiri
 * girilmemişse `km` null olur ve yıpranma payı hiç hesaplanmaz — eksik
 * değil, yok.
 */
function collectDistance(
  shifts: readonly ShiftRow[], fallbackRate: Kurus | undefined,
): { km: number | null; missing: number; isPartial: boolean; wearShare: Kurus } {
  let total = 0;
  let known = 0;
  let missing = 0;
  let wearShare = ZERO;

  for (const s of shifts) {
    const km = normalizeDistance(s.distanceKm);
    if (km == null) {
      if (s.endedAt != null) missing += 1;
      continue;
    }

    total += km;
    known += 1;

    /**
     * Pay HER VARDİYA İÇİN AYRI hesaplanıp toplanıyor, toplam kilometreye
     * tek oran uygulanmıyor: iki farklı araçla çalışılan günde tek orana
     * indirgemek ortalama almak demektir ve ortalama kuruş kaybettirir.
     */
    const rate = s.wearPerKmKurus ?? fallbackRate;
    if (rate != null && rate > 0) {
      wearShare = add(wearShare, multiply(rate, km));
    }
  }

  if (known === 0) return { km: null, missing, isPartial: false, wearShare: ZERO };
  return { km: total, missing, isPartial: missing > 0, wearShare };
}

/** Vardiya sürelerini toplar; biri bile sürücü tarafından yazılmışsa... */
function collectDuration(shifts: readonly ShiftTiming[], now: UnixMs): {
  minutes: number; isEstimated: boolean;
} {
  let minutes = 0;
  let isEstimated = false;

  for (const s of shifts) {
    const d = resolveShiftDuration(s, now);
    minutes += d.minutes;
    /**
     * ...gün geneli yine de TAHMİNİ sayılır: karışık bir günde toplamın
     * güvenilirliği en zayıf halkası kadardır. Tersini yapıp "yazılmış"
     * demek, damgadan türetilmiş yarıyı da doğrulanmış gösterirdi.
     */
    if (d.isEstimated) isEstimated = true;
  }

  return { minutes, isEstimated };
}

/** Boş ve negatif komisyonu sıfıra düşürür — negatif komisyon gelir olurdu. */
function sanitizeCommission(value: Kurus | null | undefined): Kurus {
  if (value == null || !Number.isFinite(value) || value <= 0) return ZERO;
  return value;
}

interface FuelCollection {
  cost: Kurus;
  volume: number | null;
  source: FuelSource;
  unknownShiftCount: number;
  unknownShiftIds: string[];
  notCounted: Kurus;
  offDay: Kurus;
  status: Record<string, FuelLogStatus>;
}

/** Aracı bilinmeyen eski satırların ortak kovası — hepsi aynı araç sayılır. */
const NO_VEHICLE = '';

/**
 * Günün yakıtı — YAKIT VARDİYA BAŞINA TEK SAYI.
 *
 * 1. Her vardiya: tüketim × km × fiyat hesaplanabiliyorsa o sayılır ve
 *    o vardiyaya bağlı dolumlar AYRICA düşülmez. Hesaplanamıyorsa o
 *    vardiyaya bağlı dolumların toplamı sayılır. İkisi de yoksa yakıtı
 *    BİLİNMİYOR (tutar 0, eksiklik bayrağı).
 * 2. Vardiyasız dolum (bağ yok ya da bağlı vardiya silinmiş) iş günü +
 *    araç çiftine göre:
 *    - o gün o araçla tüketimi hesaplanmış vardiya varsa sayılmaz,
 *    - yoksa ve o gün o araçla vardiya varsa o günün yakıtıdır — o aracın
 *      yakıtı bilinmeyen vardiyaları da bu dolumla kapsanmış sayılır,
 *    - o gün o araçla hiç vardiya yoksa ("gün dışı" depo alımı) maliyete
 *      girmez; yalnızca litre fiyatı kaynağıdır.
 *
 * Eskiden karar TEK BİR GÜN ANAHTARIYLA veriliyordu: günün vardiyalarından
 * yalnızca birinde tüketim hesaplanabilse bile o günün BÜTÜN dolumları
 * hesaptan çıkıyordu. Tüketimi girilmemiş öteki vardiyanın 300 ₺'lik
 * yakıtı hiçbir yerde görünmüyordu.
 *
 * Her vardiya KENDİ tüketimi ve KENDİ fiyatıyla hesaplanıyor: fiyat gün
 * içinde değişebilir, iki araçla çalışılan günde tüketimler farklıdır.
 */
function collectFuel(
  shifts: readonly ShiftRow[], logs: readonly FuelRow[],
): FuelCollection {
  const status: Record<string, FuelLogStatus> = {};
  const mark = (log: FuelRow, s: FuelLogStatus) => { if (log.id) status[log.id] = s; };
  const vehicleOf = (v: string | null | undefined) => v ?? NO_VEHICLE;

  const shiftIds = new Set(shifts.map((s) => s.id).filter((id): id is string => id != null));
  const linked = new Map<string, FuelRow[]>();
  const unlinked: FuelRow[] = [];
  for (const log of logs) {
    if (log.shiftId && shiftIds.has(log.shiftId)) {
      linked.set(log.shiftId, [...(linked.get(log.shiftId) ?? []), log]);
    } else {
      unlinked.push(log);
    }
  }

  let burnedCost = ZERO;
  let filledCost = ZERO;
  let notCounted = ZERO;
  let offDay = ZERO;
  let volume = 0;
  let anyBurned = false;
  let anyFilled = false;

  const burnedVehicles = new Set<string>();
  const shiftVehicles = new Set<string>();
  const unknown: ShiftRow[] = [];

  for (const s of shifts) {
    const vehicle = vehicleOf(s.vehicleId);
    shiftVehicles.add(vehicle);
    const fills = (s.id ? linked.get(s.id) : undefined) ?? [];
    const burned = calculateFuelCost(s.distanceKm, s.fuelConsumptionPer100Km, s.fuelPriceKurus);

    if (burned > 0) {
      burnedCost = add(burnedCost, burned);
      volume += calculateFuelVolume(s.distanceKm, s.fuelConsumptionPer100Km) ?? 0;
      anyBurned = true;
      burnedVehicles.add(vehicle);
      for (const f of fills) { notCounted = add(notCounted, f.totalAmountKurus); mark(f, 'covered'); }
    } else if (fills.length > 0) {
      filledCost = add(filledCost, sum(fills.map((f) => f.totalAmountKurus)));
      anyFilled = true;
      for (const f of fills) mark(f, 'counted');
    } else if (s.endedAt != null) {
      // Açık vardiya eksik sayılmaz: kilometresi ve tüketimi henüz sorulmadı.
      unknown.push(s);
    }
  }

  const coveredVehicles = new Set<string>();
  for (const log of unlinked) {
    const vehicle = vehicleOf(log.vehicleId);
    if (burnedVehicles.has(vehicle)) {
      notCounted = add(notCounted, log.totalAmountKurus);
      mark(log, 'covered');
    } else if (shiftVehicles.has(vehicle)) {
      filledCost = add(filledCost, log.totalAmountKurus);
      anyFilled = true;
      coveredVehicles.add(vehicle);
      mark(log, 'counted');
    } else {
      offDay = add(offDay, log.totalAmountKurus);
      mark(log, 'off_day');
    }
  }

  const stillUnknown = unknown.filter((s) => !coveredVehicles.has(vehicleOf(s.vehicleId)));

  return {
    cost: add(burnedCost, filledCost),
    volume: anyBurned ? volume : null,
    source: anyBurned ? (anyFilled ? 'mixed' : 'burned') : (anyFilled ? 'filled' : 'none'),
    unknownShiftCount: stillUnknown.length,
    unknownShiftIds: stillUnknown.map((s) => s.id).filter((id): id is string => id != null),
    notCounted,
    offDay,
    status,
  };
}
