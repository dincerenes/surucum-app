/**
 * İstatistik kartları — ekran `src/app/(app)/(sekmeler)/istatistik.tsx`.
 *
 * Kartlar HER ZAMAN görünüyor, kayıt yokken sıfırla (sürücünün kararı,
 * 23 Eylül 2026): "5 gün kaldı", "20 yolcu kaldı" gibi bekleme yazıları
 * yok. Sürücü uygulamayı kullanmaya başlamadan neyin geleceğini görüyor;
 * ilk yolcudan itibaren sayılar doluyor. Kartların altında açıklama
 * yazısı yok (sürücünün kararı); kuralların anlatımı hesap modüllerinde.
 * Hesapların hepsi
 * `src/lib/insights.ts` ve `efficiency.ts` içinde; burada yalnızca çizim.
 */

import { StyleSheet, Text, View } from 'react-native';

import {
  Card, Donut, ProfitRows, ScoreRing, StatGrid, StatTile, periodRowsData, useScoreColor,
} from '@/components/ui';
import type { StatsOverview } from '@/db/repo';
import {
  type BusinessDate, MONTHS_TR, WEEKDAYS_TR, formatBusinessDate, weekdayIndex,
} from '@/lib/business-date';
import { SCORE_BAND_LABELS, scoreBand } from '@/lib/efficiency';
import { trendRatio } from '@/lib/insights';
import { type Kurus, formatDecimal, formatInteger, formatKurus } from '@/lib/money';
import { PERIOD_LABELS, type PeriodKey } from '@/lib/period';
import { formatDuration } from '@/lib/shift';
import { percentChange } from '@/lib/stats';
import { accentStep, radius, space, type as typeScale, useTheme } from '@/theme/use-theme';

/**
 * Boş değer SIFIR yazılıyor, tire değil (sürücünün kararı, 23 Eylül
 * 2026): kartlar ilk kayıttan önce de dolu duruyor, sürücü neyin
 * geleceğini görüyor.
 */
const money0 = (v: Kurus | null | undefined) => formatKurus(v ?? 0, { decimals: false });
/** Km başına tutarlar küçük: 5,90 ₺'yi 6 ₺ diye yuvarlamak farkı siler. */
const moneyFine0 = (v: Kurus | null | undefined) => formatKurus(v ?? 0);
const decimal0 = (v: number | null) => (v == null || v === 0 ? '0' : formatDecimal(v));

/**
 * Kısa gün adları. Adın ilk harflerini kesmek Cuma ile Cumartesi'yi
 * ikisini de "Cum" yapıyordu.
 */
const WEEKDAY_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

function Note({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <Text style={[typeScale.caption, { color: colors.textFaint }]}>{children}</Text>;
}

// ---------------------------------------------------------------------------
// 1. Dönem özeti
// ---------------------------------------------------------------------------

/**
 * Üç satır, önceki dönemle fark ve kazanç seyri tek kartta. Karşılaştırma
 * eskiden ayrı bir karttı; "geçen aya göre" sorusu özetin kendisinin
 * devamı.
 */
export function PeriodCard({ data, period }: { data: StatsOverview; period: PeriodKey }) {
  const { colors } = useTheme();
  const t = data.totals;
  const prev = data.previous;
  const change = prev && prev.workedDayCount > 0 ? percentChange(t.cashProfit, prev.cashProfit) : null;

  return (
    <Card
      title={PERIOD_LABELS[period]}
      meta={`${t.workedDayCount} gün çalışıldı`}
      icon={{ ios: 'list.bullet.rectangle', android: 'receipt_long' }}
    >
      <ProfitRows data={periodRowsData(t)} />

      {period !== 'all' && prev ? (
        <View style={[styles.compare, { backgroundColor: colors.surfaceSunken }]}>
          <Text style={[typeScale.caption, { color: colors.textFaint }]}>
            {data.previousLabel}: {money0(prev.cashProfit)} cebe kalan
          </Text>
          {change != null ? (
            <Text style={[typeScale.bodyStrong, { color: change >= 0 ? colors.positive : colors.negative }]}>
              {change >= 0 ? '▲' : '▼'} %{Math.abs(change).toFixed(0)} {change >= 0 ? 'daha iyi' : 'daha düşük'}
            </Text>
          ) : null}
        </View>
      ) : null}

      <Trend data={data} period={period} />
    </Card>
  );
}

const TREND_HEIGHT = 72;

function Trend({ data, period }: { data: StatsOverview; period: PeriodKey }) {
  const { colors } = useTheme();
  const { unit, bars } = data.trend;
  if (bars.length === 0) return null;

  const label = (key: string) => (unit === 'month'
    ? MONTHS_TR[Number(key.slice(5, 7)) - 1].slice(0, 3)
    : period === 'week'
      ? WEEKDAY_SHORT[weekdayIndex(key as BusinessDate)]
      : String(Number(key.slice(8, 10))));

  /**
   * Çok çubukta her etiket sığmıyor: baş, orta, son — sütunların altına
   * değil ayrı bir satıra, yoksa dar sütunda "12" bile kırpılıyor.
   */
  const few = bars.length <= 12;
  const ends = [bars[0], bars[Math.floor(bars.length / 2)], bars[bars.length - 1]];

  return (
    <View style={styles.trendWrap}>
      <Note>{unit === 'month' ? 'Ay ay cebe kalan' : 'Gün gün cebe kalan'}</Note>
      <View style={[styles.trend, { gap: bars.length > 12 ? 2 : space.xs }]}>
        {bars.map((b) => {
          const loss = b.cashProfit != null && b.cashProfit < 0;
          const ratio = trendRatio(b.cashProfit, bars);
          return (
            <View key={b.key} style={styles.trendCol}>
              <View style={[styles.trendTrack, { backgroundColor: colors.surfaceSunken }]}>
                <View style={{
                  height: loss ? 3 : Math.max(ratio * TREND_HEIGHT, b.cashProfit != null ? 3 : 0),
                  backgroundColor: loss ? colors.negative : colors.accent,
                  borderRadius: 3,
                }} />
              </View>
              {few ? (
                <Text style={[styles.tick, { color: colors.textFaint }]} numberOfLines={1}>
                  {label(b.key)}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
      {!few ? (
        <View style={styles.hourTicks}>
          {ends.map((b) => (
            <Text key={b.key} style={[styles.tick, { color: colors.textFaint }]}>{label(b.key)}</Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// 2. Verimlilik analizi
// ---------------------------------------------------------------------------

const SCORE_BAR_HEIGHT = 48;
/** Hiç puan yokken çizilen boş çubuk sayısı — kartın iskeleti görünsün. */
const EMPTY_SCORE_BARS = 7;

export function EfficiencyCard({ data }: { data: StatsOverview }) {
  const { colors } = useTheme();
  const colorFor = useScoreColor();
  const avg = data.averageScore;
  const latest = data.scores[data.scores.length - 1];
  const shown = data.scores.slice(-31);

  return (
    <Card title="Verimlilik analizi" icon={{ ios: 'gauge.with.dots.needle.67percent', android: 'speed' }}>
      <View style={styles.scoreHead}>
        <ScoreRing score={avg ?? 0} size={84} />
        <View style={styles.scoreText}>
          <Text style={[typeScale.heading, { color: avg == null ? colors.textFaint : colorFor(avg) }]}>
            {avg == null ? 'Henüz puanlanan gün yok' : SCORE_BAND_LABELS[scoreBand(avg)]}
          </Text>
          <Text style={[typeScale.body, { color: colors.textSoft }]}>
            {`${formatInteger(data.scores.length)} günün ortalama puanı`}
          </Text>
          <Text style={[typeScale.caption, { color: colors.textFaint }]}>
            {`Normal günün: ${money0(latest?.baseline.perHour)}/saat`
              + ` · ${moneyFine0(latest?.baseline.perKm)}/km`}
          </Text>
        </View>
      </View>

      <View style={[styles.scoreBars, { gap: shown.length > 12 ? 2 : space.xs }]}>
        {shown.length > 0
          ? shown.map((s) => (
            <View key={s.date} style={[styles.scoreTrack, { backgroundColor: colors.surfaceSunken }]}>
              <View style={{
                height: Math.max(3, (s.score / 100) * SCORE_BAR_HEIGHT),
                backgroundColor: colorFor(s.score),
                borderRadius: 3,
              }} />
            </View>
          ))
          : Array.from({ length: EMPTY_SCORE_BARS }, (_, i) => (
            <View key={i} style={[styles.scoreTrack, { backgroundColor: colors.surfaceSunken }]} />
          ))}
      </View>

    </Card>
  );
}

// ---------------------------------------------------------------------------
// 3. Zaman verimliliği
// ---------------------------------------------------------------------------

export function TimeCard({ data }: { data: StatsOverview }) {
  const t = data.time;
  return (
    <Card title="Zaman verimliliği" icon={{ ios: 'clock.fill', android: 'schedule' }}>
      <StatGrid>
        <StatTile value={money0(t.perHour)} label="saat başına cebe kalan" />
        <StatTile value={formatDuration(t.totalMinutes)} label="toplam çalışma" />
        <StatTile value={formatDuration(t.minutesPerShift ?? 0)} label="ortalama vardiya" />
        <StatTile value={decimal0(t.ridesPerHour)} label="saatte yolcu" />
        <StatTile value={formatDuration(t.minutesPerRide ?? 0)} label="yolcu başına süre" />
        <StatTile value={formatInteger(t.closedShiftCount)} label="kapanan vardiya" />
      </StatGrid>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 4. Sıcak saatler
// ---------------------------------------------------------------------------

const HOUR_BAR_HEIGHT = 64;
const pad = (h: number) => String(h).padStart(2, '0');

export function HotHoursCard({ data }: { data: StatsOverview }) {
  const { colors } = useTheme();
  const hot = data.hot;
  const inHot = (h: number) => hot != null
    && ((h - hot.startHour + 24) % 24) < ((hot.endHour - hot.startHour + 24) % 24 || 24);

  return (
    <Card title="Sıcak saatler" icon={{ ios: 'flame.fill', android: 'local_fire_department' }}>
      <Text style={[typeScale.body, { color: colors.textSoft }]}>
        En yoğun saatlerin{' '}
        <Text style={{ color: colors.text, fontWeight: '700' }}>
          {hot ? `${pad(hot.startHour)}:00–${pad(hot.endHour)}:00` : '—'}
        </Text>
        {hot ? ` — yolcularının %${Math.round(hot.share * 100)}'i bu 3 saatte.` : ''}
      </Text>
      <View style={styles.hours}>
        {data.hours.map((b) => (
          <View key={b.hour} style={styles.hourCol}>
            <View style={[styles.hourTrack, { backgroundColor: colors.surfaceSunken }]}>
              <View style={{
                height: b.rideCount > 0 ? Math.max(3, b.ratio * HOUR_BAR_HEIGHT) : 0,
                backgroundColor: inHot(b.hour) ? colors.warning : colors.accentScale[3],
                borderRadius: 2,
              }} />
            </View>
          </View>
        ))}
      </View>
      <View style={styles.hourTicks}>
        {[0, 6, 12, 18].map((h) => (
          <Text key={h} style={[styles.tick, { color: colors.textFaint }]}>{pad(h)}</Text>
        ))}
        <Text style={[styles.tick, { color: colors.textFaint }]}>24</Text>
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 5. En verimli gün
// ---------------------------------------------------------------------------

/**
 * Haftanın günlerine göre ORTALAMA cebe kalan (toplam değil: çok
 * çalışılan gün kendiliğinden kazançlı görünmesin) ve dönemin en yüksek
 * puanlı günü.
 */
export function BestDayCard({ data }: { data: StatsOverview }) {
  const { colors } = useTheme();
  const colorFor = useScoreColor();
  const stats = data.weekdays;
  const top = data.scores.reduce<(typeof data.scores)[number] | null>(
    (acc, s) => (acc == null || s.score > acc.score || (s.score === acc.score && s.date > acc.date) ? s : acc),
    null,
  );
  const best = stats.reduce<(typeof stats)[number] | null>(
    (acc, s) => (s.average != null && (acc == null || s.average > acc.average!) ? s : acc), null,
  );

  return (
    <Card title="En verimli gün" icon={{ ios: 'trophy.fill', android: 'emoji_events' }}>
      <View style={styles.topDay}>
        <View style={{ flex: 1 }}>
          <Text style={[typeScale.bodyStrong, { color: colors.text }]}>
            {top ? formatBusinessDate(top.date, 'weekday') : '—'}
          </Text>
          <Text style={[typeScale.caption, { color: colors.textFaint }]}>
            {`dönemin en yüksek puanı · ${money0(top?.perHour)}/saat`}
          </Text>
        </View>
        <Text style={[typeScale.title, { color: top ? colorFor(top.score) : colors.textFaint }]}>
          {top?.score ?? 0}
        </Text>
      </View>

      <View style={styles.strip}>
        {stats.map((s) => (
          <View key={s.index} style={styles.stripCol}>
            <View style={[styles.stripCell, {
              backgroundColor: s.dayCount === 0 ? colors.surfaceSunken : accentStep(colors, s.ratio),
            }]} />
            <Text style={[typeScale.caption, { color: colors.textFaint }]}>
              {WEEKDAY_SHORT[s.index]}
            </Text>
          </View>
        ))}
      </View>

      <Text style={[typeScale.body, { color: colors.textSoft }]}>
        En kazançlı günün{' '}
        <Text style={{ color: colors.text }}>
          {best?.average != null && best.average > 0 ? WEEKDAYS_TR[best.index] : '—'}
        </Text>
        {best?.average != null && best.average > 0
          ? ` — ortalama ${money0(best.average)} cebe kalıyor.`
          : ''}
      </Text>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 6. Yolcu analizi
// ---------------------------------------------------------------------------

export function RidesCard({ data }: { data: StatsOverview }) {
  const { colors } = useTheme();
  const r = data.rides;
  return (
    <Card title="Yolcu analizi" icon={{ ios: 'person.2.fill', android: 'group' }}>
      <StatGrid>
        <StatTile value={formatInteger(r.rideCount)} label="toplam yolcu" />
        <StatTile value={decimal0(r.ridesPerDay)} label="yolcu / gün" />
        <StatTile value={money0(r.revenuePerRide)} label="yolcu başı ciro" />
        <StatTile value={money0(r.cashPerRide)} label="yolcu başı cebe kalan" />
      </StatGrid>
      <Text style={[typeScale.body, { color: colors.textSoft }]}>
        En yoğun günün{' '}
        <Text style={{ color: colors.text }}>
          {r.busiestDay ? formatBusinessDate(r.busiestDay.date, 'weekday') : '—'}
        </Text>
        {r.busiestDay ? ` — ${formatInteger(r.busiestDay.rideCount)} yolcu.` : ''}
      </Text>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 7. Km analizi
// ---------------------------------------------------------------------------

export function KmCard({ data }: { data: StatsOverview }) {
  const k = data.km;
  return (
    <Card title="Km analizi" icon={{ ios: 'road.lanes', android: 'route' }}>
      <StatGrid>
        <StatTile value={`${formatInteger(k.totalKm ?? 0)} km`} label="toplam" />
        <StatTile value={`${formatInteger(k.kmPerDay ?? 0)} km`} label="gün başına" />
        <StatTile value={moneyFine0(k.revenuePerKm)} label="km başı ciro" />
        <StatTile value={moneyFine0(k.costPerKm)} label="km başı yakıt + yıpranma" />
        <StatTile value={moneyFine0(k.cashPerKm)} label="km başı cebe kalan" />
        <StatTile value={`${decimal0(k.kmPerRide)} km`} label="yolcu başına" />
      </StatGrid>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 8. Gider dağılımı
// ---------------------------------------------------------------------------

/** Hiç gider yokken açıklamada duran satırlar — neyin dağılacağı görünsün. */
const EMPTY_COST_SLICES = ['Komisyon', 'Yakıt', 'Yıpranma payı', 'Giderler']
  .map((label) => ({ key: label, label, amount: 0, share: 0 }));

export function CostsCard({ data }: { data: StatsOverview }) {
  const c = data.costs;
  return (
    <Card title="Gider dağılımı" icon={{ ios: 'chart.pie.fill', android: 'pie_chart' }}>
      <Donut
        slices={c.slices.length > 0 ? c.slices : EMPTY_COST_SLICES}
        total={c.total}
        centerLabel="toplam"
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  compare: { borderRadius: radius.md, padding: space.md, gap: 2 },
  trendWrap: { gap: space.xs, marginTop: space.xs },
  trend: { flexDirection: 'row', alignItems: 'flex-end' },
  trendCol: { flex: 1, alignItems: 'center', gap: 4 },
  trendTrack: {
    width: '100%', height: TREND_HEIGHT, borderRadius: 3,
    justifyContent: 'flex-end', overflow: 'hidden',
  },
  tick: { fontSize: 11, lineHeight: 14, fontVariant: ['tabular-nums'] },
  scoreHead: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  scoreText: { flex: 1, gap: 2 },
  scoreBars: { flexDirection: 'row', alignItems: 'flex-end', height: SCORE_BAR_HEIGHT },
  scoreTrack: {
    flex: 1, height: SCORE_BAR_HEIGHT, borderRadius: 3,
    justifyContent: 'flex-end', overflow: 'hidden',
  },
  hours: { flexDirection: 'row', gap: 2, alignItems: 'flex-end' },
  hourCol: { flex: 1 },
  hourTrack: {
    height: HOUR_BAR_HEIGHT, borderRadius: 2, justifyContent: 'flex-end', overflow: 'hidden',
  },
  hourTicks: { flexDirection: 'row', justifyContent: 'space-between' },
  topDay: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  strip: { flexDirection: 'row', gap: space.xs },
  stripCol: { flex: 1, alignItems: 'center', gap: space.xs },
  stripCell: { width: '100%', height: 44, borderRadius: radius.sm },
});
