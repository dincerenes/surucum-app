import { Card } from './card';
import { StatGrid, StatTile } from './stat-tile';
import { ProfitRows, type ProfitRowsData } from './summary-rows';
import { formatInteger, formatKurus } from '@/lib/money';
import type { PeriodTotals } from '@/lib/stats';
import { buildPeriodNotes, isFuelUnknown } from '@/lib/summary-notes';

/**
 * Dönem toplamlarını üç satırlık bloğun şekline çevirir — Kayıtlar'ın
 * dönem özeti ve İstatistik aynı dönüşümü kullanıyor.
 *
 * Hacim ve kaynak dönem geneline yazılmıyor: günlerin bir kısmında
 * tüketim girilmiş, bir kısmında girilmemiş olabilir ve yarısı ölçülmüş
 * bir litre toplamı yanlış bilgidir. Kaynak farkları notlarda söyleniyor.
 */
export function periodRowsData(totals: PeriodTotals): ProfitRowsData {
  return {
    revenue: totals.revenue,
    commission: totals.commission,
    fuelPaid: totals.fuelPaid,
    expensesPaid: totals.expensesPaid,
    cashProfit: totals.cashProfit,
    wearShare: totals.wearShare,
    trueProfit: totals.trueProfit,
    fuelVolume: null,
    fuelSource: 'none',
    fuelUnknown: isFuelUnknown(totals.fuelPaid, totals.shiftsMissingFuel),
    distanceKm: totals.distanceKm,
    notes: buildPeriodNotes(totals),
  };
}

/**
 * Dönem özeti — Kayıtlar'da hangi filtre seçilirse seçilsin en üstte.
 *
 * Önce sürücünün saydığı şeyler (vardiya, yolcu, km, gün başına ciro),
 * sonra paranın üç satırı. Kesintiler tek satırda: kalem kalem döküm
 * İstatistik'te ve vardiya detayında.
 */
export function PeriodSummaryCard({
  totals, meta,
}: { totals: PeriodTotals; meta?: string }) {
  return (
    <Card title="Dönem özeti" meta={meta}>
      <StatGrid>
        <StatTile value={formatInteger(totals.shiftCount)} label="vardiya" />
        <StatTile value={formatInteger(totals.rideCount)} label="yolcu" />
        <StatTile
          value={totals.distanceKm != null ? formatInteger(totals.distanceKm) : '—'}
          label="km"
        />
        <StatTile
          value={totals.revenuePerDay != null
            ? formatKurus(totals.revenuePerDay, { decimals: false }) : '—'}
          label="günlük ortalama ciro"
        />
      </StatGrid>
      <ProfitRows data={periodRowsData(totals)} detailed={false} />
    </Card>
  );
}
