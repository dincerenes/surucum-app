/**
 * Ekranların ihtiyaç duyduğu ortak durum: kullanıcı, aktif araç, açık
 * vardiya ve bugünün özeti.
 *
 * Tek yerde toplanıyor çünkü her ekran aynı dört şeyi soruyor ve her
 * birinin ayrı ayrı hesaplaması hem tekrar hem de tutarsızlık riski.
 */

import { useMemo } from 'react';
import { useDbValue } from '@/db/use-db';
import {
  ensureSettings, getDailyGoalKurus, getDaySummary, getOpenShift, getVehicle,
  listActiveVehicles, listRidesInShift, listRidesOnDate,
} from '@/db/repo';
import { useAuth } from '@/lib/auth/auth-context';
import { type BusinessDate, todayBusinessDate } from '@/lib/business-date';
import type { DaySummary } from '@/lib/day-summary';
import { type GoalProgress, calculateGoalProgress } from '@/lib/goal';
import { type Kurus, ZERO, add } from '@/lib/money';
import { isShiftStale } from '@/lib/shift';
import { useBusinessToday } from '@/lib/use-business-today';
import type { Ride, Shift } from '@/db/schema/earnings';
import type { Vehicle } from '@/db/schema/vehicles';
import { resolveWorkingVehicle } from '@/lib/vehicle-resolve';

export interface DriverState {
  userId: string | null;
  /**
   * Kayıtların yazılacağı araç: AÇIK VARDİYANIN aracı, vardiya yoksa
   * Araçlarım'da seçili araç. Sefer, gider, yakıt ve vardiya sonu ön
   * dolgusu hep bunu kullanıyor.
   */
  vehicle: Vehicle | null;
  /** Bir sonraki vardiyanın aracı — Araçlarım'daki seçim. */
  nextVehicle: Vehicle | null;
  /** Açık vardiya seçili araçtan başka bir araçla mı sürüyor? */
  vehicleDiverged: boolean;
  /** Kurulum tamamlandı mı? Araç yoksa uygulama kullanılamaz. */
  needsSetup: boolean;
  openShift: Shift | null;
  /** Açık vardiya eşiği aştı mı? Arayüz sormak zorunda. */
  shiftIsStale: boolean;
  /**
   * Ekranda gösterilen iş günü.
   *
   * Vardiya AÇIKSA onun günü — takvim günü dönse bile ekran vardiyayla
   * birlikte kalır. Gece 22:00'de başlayan vardiya sabah 05:00'te hâlâ
   * aynı defterde görünür; sürücü tek bir iş yaptı.
   */
  today: BusinessDate;
  summary: DaySummary | null;
  /** Gün defterinin seferleri — iş gününün tamamı. */
  rides: Ride[];

  /**
   * YALNIZCA açık vardiyanın seferleri.
   *
   * Günden ayrı tutuluyor: bir iş gününde iki vardiya olabilir ve canlı
   * ekran "CANLI VARDİYA" diyorsa oradaki her sayı o vardiyanın olmalı.
   * Karıştırıldığında sürücü, yeni başlattığı boş vardiyada bir önceki
   * vardiyanın parasını görüyor.
   */
  shiftRides: Ride[];

  /** Açık vardiyanın cirosu — brüt, hiçbir kesinti düşülmemiş. */
  shiftGross: Kurus;

  /**
   * Günlük hedefin durumu. Hedef konmamışsa `null` — hedefsiz sürücüye
   * boş bir çubuk göstermiyoruz.
   */
  goal: GoalProgress | null;
}

const EMPTY: DriverState = {
  userId: null, vehicle: null, nextVehicle: null, vehicleDiverged: false,
  needsSetup: true, openShift: null,
  shiftIsStale: false,
  today: todayBusinessDate(), summary: null, rides: [],
  shiftRides: [], shiftGross: ZERO, goal: null,
};

export function useDriver(): DriverState {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  /**
   * Takvim günü kayıt yazılmadan da döner; bağımlılık olarak verilmezse
   * vardiyasız sürücü sabah dünün defterini görür (bkz. `useBusinessToday`).
   * Vardiya açıkken aşağıda yine vardiyanın günü kazanır.
   */
  const today = useBusinessToday(userId);

  const value = useDbValue(() => {
    if (!userId) return { ...EMPTY, today };

    const settings = ensureSettings(userId);
    const now = Date.now();

    /**
     * Seçili araç AYARDAN geliyor, listenin ilkinden değil: sürücü
     * Araçlarım'dan başka bir aracı seçtiğinde YENİ vardiya ona bağlanmalı.
     *
     * Ama açık vardiya KENDİ ARACINDA kalır. İkisi eskiden bağımsız
     * çözülüyordu: vardiya ortasında B'yi seçen sürücünün seferleri A
     * vardiyasına ama B aracına yazılıyor, vardiya sonu B'nin tüketimiyle
     * açılıyordu. Çözümleme `resolveWorkingVehicle` içinde, tek yerde —
     * Araçlarım ekranı da aynısını çağırıyor. Vardiyanın aracı pasif olsa
     * bile (`getVehicle` pasifleri de buluyor) kayıtlar ona yazılır.
     */
    const vehicles = listActiveVehicles(userId);
    const openShift = getOpenShift(userId) ?? null;
    const shiftVehicle = openShift ? getVehicle(userId, openShift.vehicleId) ?? null : null;
    const { working, next, diverged } = resolveWorkingVehicle(
      vehicles, settings.defaultVehicleId, shiftVehicle,
    );

    // Vardiya açıkken defter onun gününde kalır, takvim dönse bile.
    const activeDate = openShift?.businessDate ?? today;

    const shiftRides = openShift ? listRidesInShift(userId, openShift.id) : [];
    const summary = getDaySummary(userId, activeDate, now);

    return {
      userId,
      vehicle: working,
      nextVehicle: next,
      vehicleDiverged: diverged,
      needsSetup: next == null,
      openShift,
      shiftIsStale: openShift ? isShiftStale(openShift, now) : false,
      today: activeDate,
      summary,
      rides: listRidesOnDate(userId, activeDate),
      shiftRides,
      shiftGross: shiftRides.reduce((sum, r) => add(sum, r.grossAmountKurus), ZERO),
      /**
       * Hedefin paydası CEBE KALAN. Ciro hedefi yakıtı ve komisyonu yok
       * sayar; gerçek kâr ise kilometre girilene kadar eksik.
       */
      goal: calculateGoalProgress(getDailyGoalKurus(userId), summary.profit.cashProfit),
    } satisfies DriverState;
  }, [userId, today]);

  return useMemo(() => value, [value]);
}
