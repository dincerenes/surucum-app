import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/ui';
import { DURATION } from '@/lib/motion';
import { type HourCell, type StripWindow, formatWindow } from '@/lib/pusula';
import { accentStep, radius, space, type as typeScale, useTheme } from '@/theme/use-theme';

const HEIGHT = 104;
/** Sürücü günü 06:00'da başlıyor; etiketler şeridin 0, 6, 12, 18, 24. saatleri. */
const HOUR_LABELS = ['06', '12', '18', '00', '06'] as const;

interface Props {
  cells: readonly HourCell[];
  windows: readonly StripWindow[];
  /** Bugünse şimdiki saatin şerit indeksi, kesirli (12:30 → 6,5). Değilse `null`. */
  now: number | null;
  accessibilityLabel: string;
}

/**
 * Günün ritmi — 24 saatlik çubuk grafik.
 *
 * Eskiden renk bandıydı: yoğunluk yalnız tonla anlatılıyordu ve iki
 * komşu ton güneş altında ayırt edilmiyordu. Yükseklik tondan çok daha
 * hızlı okunuyor; ton yine de aynı şeyi söylüyor, tek başına renkle
 * anlatılmıyor.
 *
 * Yoğun pencereler çubukların ARKASINDA turuncu-yumuşak bir zemin ve
 * altta etiketli: "Sıcak saatler" uzun bir cümleydi, şimdi grafiğin
 * üstünde yerini gösteren üç kısa etiket.
 */
export function RhythmChart({ cells, windows, now, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const slot = 100 / cells.length;

  return (
    <View style={styles.wrap}>
      <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
        <View style={styles.plot}>
          {windows.map((w) => (
            <View
              key={w.startIdx}
              style={[styles.band, {
                left: `${w.startIdx * slot}%`,
                width: `${(w.endIdx - w.startIdx) * slot}%`,
                backgroundColor: colors.warningSoft,
              }]}
            />
          ))}
          <View style={styles.bars}>
            {cells.map((c, i) => (
              <Bar key={i} index={i} ratio={c.ratio} color={accentStep(colors, c.ratio)} />
            ))}
          </View>
          {now != null ? (
            <View style={[styles.now, { left: `${now * slot}%` }]} pointerEvents="none">
              <View style={[styles.nowDot, { backgroundColor: colors.text }]} />
              <View style={[styles.nowLine, { backgroundColor: colors.text }]} />
            </View>
          ) : null}
        </View>
        <View style={styles.labels}>
          {HOUR_LABELS.map((l, i) => (
            <Text key={i} style={[typeScale.caption, { color: colors.textFaint }]}>{l}</Text>
          ))}
        </View>
      </View>

      {windows.length > 0 ? (
        <View style={styles.tags}>
          {windows.map((w) => (
            <View key={w.startIdx} style={[styles.tag, { backgroundColor: colors.warningSoft }]}>
              <Icon name={{ ios: 'flame.fill', android: 'local_fire_department' }} size={12}
                color={colors.warning} />
              <Text style={[typeScale.caption, styles.tagText, { color: colors.warning }]}>
                {formatWindow(w)}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={[typeScale.caption, { color: colors.textFaint }]}>
          Bu gün için belirgin bir yoğun saat beklenmiyor.
        </Text>
      )}
    </View>
  );
}

/**
 * Tek saat. Gün değişince eski boyundan yenisine kayıyor — grafik
 * sıfırlanıp yeniden büyümüyor, iki günün farkı hareketle okunuyor.
 */
function Bar({ index, ratio, color }: { index: number; ratio: number; color: string }) {
  const h = useSharedValue(0);
  const first = useSharedValue(true);
  const target = Math.max(4, ratio * HEIGHT);

  useEffect(() => {
    const delay = first.get() ? index * 18 : 0;
    first.set(false);
    h.set(withDelay(delay, withTiming(target, {
      duration: DURATION.base, easing: Easing.out(Easing.cubic),
    })));
  }, [target, index, h, first]);

  const style = useAnimatedStyle(() => ({ height: h.get() }));
  return (
    <View style={styles.slot}>
      <Animated.View style={[styles.bar, { backgroundColor: color }, style]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  plot: { height: HEIGHT },
  band: { position: 'absolute', top: 0, bottom: 0, borderRadius: radius.sm },
  bars: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    flexDirection: 'row', alignItems: 'flex-end',
  },
  slot: { flex: 1, paddingHorizontal: 1, justifyContent: 'flex-end', height: '100%' },
  bar: { borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  now: { position: 'absolute', top: -6, bottom: 0, width: 2, marginLeft: -1, alignItems: 'center' },
  nowDot: { width: 8, height: 8, borderRadius: 4 },
  nowLine: { flex: 1, width: 2 },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xs },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tag: {
    flexDirection: 'row', alignItems: 'center', gap: space.xs,
    borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs,
  },
  tagText: { fontWeight: '600', fontVariant: ['tabular-nums'] },
});
