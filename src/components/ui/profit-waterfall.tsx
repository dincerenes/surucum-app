import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming,
} from 'react-native-reanimated';

import { AmountText } from './amount-text';
import { Card } from './card';
import type { DaySummary } from '@/lib/day-summary';
import { haptic } from '@/lib/haptics';
import type { Kurus } from '@/lib/money';
import { DURATION } from '@/lib/motion';
import { CASH_PROFIT_CAPTION, TRUE_PROFIT_CAPTION } from '@/lib/summary-notes';
import { upperTr } from '@/lib/text';
import {
  type WaterfallKind, buildWaterfall, positionPx, revealPlan, segmentPx,
  waterfallA11yLabel, wearSentence,
} from '@/lib/waterfall';
import { type Colors, space, type as typeScale, useTheme } from '@/theme/use-theme';

/** Satır yüksekliği ve aralığı — etiket sütunu ile çubuk sütunu aynı ızgarada. */
const ROW_H = 20;
const ROW_GAP = 6;
/** Etiket sütunu: "Gerçek kâr" caption boyunda sığıyor, çubuğa yer kalıyor. */
const LABEL_W = 84;
/** Sıfır olmayan kalemin en dar çubuğu — 5 ₺'lik otopark da görünmeli. */
const MIN_BAR = 3;

/**
 * Vardiya sonu kâr şelalesi — ödül anı.
 *
 * Ciro tam boy uzanır; komisyon, yakıt ve gider her biri bir önceki
 * toplamın bittiği yerden DÜŞER; cebe kalan ve gerçek kâr sıfırdan
 * yeniden çizilir. Sürücü cebinde kalanın nereye gittiğini bir bakışta
 * görür — ve yıpranma payının cebe kalanı gerçek kâra nasıl indirdiğini.
 * 2 ile 3 arasındaki fark bu ürünün varlık sebebi; bu resim o farkı
 * görünür kılmak için var.
 *
 * SATIRLARIN YERİNİ TUTMAZ. Brief toplanabilen görünür satırlar istiyor:
 * kesin sayılar altta `SummaryRows`'ta duruyor, bu yalnızca üstlerindeki
 * resim. Çubuklarda bu yüzden rakam yok — aynı sayı iki yerde iki
 * biçimde yazılınca sürücü hangisine bakacağını bilemez.
 *
 * Büyük rakam çubuklarla AYNI ANDA sayar: her çubuk büyürken rakam o
 * çubuğun bittiği toplama doğru iner. Sürücü rakamın neden düştüğünü
 * hangi çubuğun büyüdüğüne bakarak okur.
 *
 * Dokunsal his: her kesinti yerine oturduğunda hafif bir tık, sonunda
 * gün kârlıysa "başarı", zararlıysa "uyarı". Bir kez — ekran yeniden
 * çizildi diye telefon yeniden titremez.
 *
 * "Hareketi azalt" açıksa her şey doğrudan son hâlinde çizilir; son
 * dokunsal his yine verilir, çünkü o hareket değil, sonucun kendisi.
 */
export function ProfitWaterfall({ summary }: { summary: DaySummary }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const p = summary.profit;

  /**
   * Yıpranma ancak kilometre girildiyse BİLİNİYOR. Girilmediyse pay
   * sıfır görünür ama sıfır değildir: o zaman gerçek kâr çubuğu da
   * çizilmez, büyük rakam cebe kalan olur. Bilinmeyen tahmin edilmez.
   */
  const distance = summary.completeness.distance;
  const wearKnown = distance === 'complete' || distance === 'partial';

  const model = useMemo(() => buildWaterfall({
    revenue: p.revenue,
    commission: p.commission,
    fuel: p.fuelPaid,
    expenses: p.expensesPaid,
    cashProfit: p.cashProfit,
    wearShare: p.wearShare,
    trueProfit: p.trueProfit,
    wearKnown,
  }), [
    p.revenue, p.commission, p.fuelPaid, p.expensesPaid,
    p.cashProfit, p.wearShare, p.trueProfit, wearKnown,
  ]);
  const plan = useMemo(
    () => revealPlan(model.steps.length, { grow: DURATION.base }),
    [model.steps.length],
  );

  const [width, setWidth] = useState(0);
  /** Büyümekte olan son çubuk; büyük rakam onun ucuna doğru sayar. */
  const [active, setActive] = useState(-1);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    const finish = () => {
      fired.current = true;
      if (model.headline.value < 0) haptic.warning();
      else haptic.success();
    };
    if (reduced) {
      finish();
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    model.steps.forEach((s, i) => {
      timers.push(setTimeout(() => setActive(i), plan.delays[i]));
      if (s.kind === 'deduction' || s.kind === 'wear') {
        timers.push(setTimeout(() => haptic.tap(), plan.delays[i] + DURATION.base));
      }
    });
    timers.push(setTimeout(finish, plan.end));
    return () => timers.forEach(clearTimeout);
  }, [model, plan, reduced]);

  const headlineTarget = reduced
    ? model.headline.value
    : ((active < 0 ? 0 : model.steps[active].to) as Kurus);
  // Renk SON değere göre: sayım sıfırdan geçerken yeşil-kırmızı yanıp sönmesin.
  const headlineColor = model.headline.value < 0 ? colors.negative : colors.positive;
  const sentence = wearKnown ? wearSentence(summary.distanceKm, p.wearShare) : null;
  const zeroX = model.min < 0 ? positionPx(0, model, width) : null;

  return (
    <Card>
      <View
        accessible
        accessibilityRole="summary"
        accessibilityLabel={waterfallA11yLabel(model)}
        style={styles.wrap}
      >
        <View style={styles.head}>
          <View style={styles.headLabel}>
            <Text style={[styles.label, { color: colors.textSoft }]}>
              {upperTr(model.headline.label)}
            </Text>
            <Text style={[typeScale.caption, { color: colors.textFaint }]}>
              {wearKnown ? TRUE_PROFIT_CAPTION : CASH_PROFIT_CAPTION}
            </Text>
          </View>
          <AmountText
            value={headlineTarget}
            size="display"
            animate
            style={{ color: headlineColor }}
          />
        </View>

        <View style={styles.chart}>
          <View style={styles.labels}>
            {model.steps.map((s) => (
              <Text
                key={s.key}
                numberOfLines={1}
                style={[
                  typeScale.caption, styles.rowLabel,
                  s.kind === 'total'
                    ? { color: colors.text, fontWeight: '600' }
                    : { color: colors.textSoft },
                ]}
              >
                {s.label}
              </Text>
            ))}
          </View>

          <View
            style={styles.tracks}
            onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}
          >
            {zeroX != null ? (
              <View
                style={[styles.zero, {
                  left: Math.min(Math.max(0, zeroX - 0.5), Math.max(0, width - 1)),
                  backgroundColor: colors.borderStrong,
                }]}
              />
            ) : null}
            {model.steps.map((s, i) => {
              const seg = segmentPx(s, model, width, MIN_BAR);
              return (
                <View key={s.key} style={styles.row}>
                  <Bar
                    start={seg.start}
                    end={seg.end}
                    color={barColor(s.kind, s.to, colors)}
                    thick={s.kind === 'total' || s.kind === 'start'}
                    delay={plan.delays[i]}
                    animate={!reduced}
                  />
                </View>
              );
            })}
          </View>
        </View>

        {sentence ? (
          <Text style={[typeScale.caption, { color: colors.textSoft }]}>{sentence}</Text>
        ) : null}
      </View>
    </Card>
  );
}

/**
 * Ciro vurgu renginde: kazanç değil, başlangıç noktası. Kesintiler gider
 * kırmızısı; yıpranma uyarı renginde, çünkü cepten çıkan para değil,
 * aracın erimesi. Toplamlar işaretine göre.
 */
function barColor(kind: WaterfallKind, to: number, colors: Colors): string {
  if (kind === 'start') return colors.accent;
  if (kind === 'deduction') return colors.negative;
  if (kind === 'wear') return colors.warning;
  return to < 0 ? colors.negative : colors.positive;
}

/**
 * Tek çubuk — `start` ucundan `end` ucuna büyür.
 *
 * Kesinti önceki toplamın ucundan SOLA doğru büyür; sürücü paranın
 * nereden eksildiğini görür. Genişlik Reanimated ile, UI iş parçacığında:
 * yedi çubuk aynı anda JS'ten çizilseydi büyük rakamın sayımı takılırdı.
 */
function Bar({
  start, end, color, thick, delay, animate,
}: {
  start: number; end: number; color: string; thick: boolean;
  delay: number; animate: boolean;
}) {
  const progress = useSharedValue(animate ? 0 : 1);

  useEffect(() => {
    if (!animate) {
      progress.value = 1;
      return;
    }
    progress.value = withDelay(delay, withTiming(1, {
      duration: DURATION.base, easing: Easing.out(Easing.cubic),
    }));
  }, [animate, delay, progress]);

  const grow = useAnimatedStyle(() => {
    const cur = start + (end - start) * progress.value;
    return { left: Math.min(start, cur), width: Math.abs(cur - start) };
  }, [start, end]);

  const h = thick ? 14 : 10;
  return (
    <Animated.View
      style={[styles.bar, { height: h, top: (ROW_H - h) / 2, backgroundColor: color }, grow]}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  head: { gap: space.xs },
  headLabel: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  label: { ...typeScale.label, letterSpacing: 1 },
  chart: { flexDirection: 'row', gap: space.md },
  labels: { width: LABEL_W, gap: ROW_GAP },
  rowLabel: { height: ROW_H, lineHeight: ROW_H },
  /** Taşma kuralı `segmentPx`'te; `hidden` yalnızca son güvence. */
  tracks: { flex: 1, gap: ROW_GAP, overflow: 'hidden' },
  row: { height: ROW_H },
  zero: { position: 'absolute', top: 0, bottom: 0, width: 1 },
  bar: { position: 'absolute', borderRadius: 3 },
});
