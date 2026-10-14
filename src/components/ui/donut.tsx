import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { formatKurus } from '@/lib/money';
import { radius, space, type as typeScale, useTheme } from '@/theme/use-theme';

export interface DonutSlice {
  key: string;
  label: string;
  amount: number;
  /** 0–1. */
  share: number;
}

/** Dilim renkleri — sırayla; fazlası son renkte toplanıyor. */
function usePalette(): string[] {
  const { colors } = useTheme();
  return [
    colors.accent, colors.warning, colors.positive, colors.accentScale[2],
    colors.negative, colors.textFaint, colors.borderStrong,
  ];
}

/**
 * Halka grafik + açıklama listesi.
 *
 * Rengin yanında her dilimin ADI, TUTARI ve YÜZDESİ yazıyor: renkle
 * tek başına anlatılan grafik renk körü sürücüye bir şey söylemez.
 * Palete sığmayan dilimler "Diğer" altında birleşiyor.
 */
export function Donut({
  slices, total, centerLabel, size = 132,
}: { slices: DonutSlice[]; total: number; centerLabel: string; size?: number }) {
  const { colors } = useTheme();
  const palette = usePalette();

  const shown = slices.length > palette.length
    ? [
      ...slices.slice(0, palette.length - 1),
      slices.slice(palette.length - 1).reduce<DonutSlice>((acc, s) => ({
        ...acc, amount: acc.amount + s.amount, share: acc.share + s.share,
      }), { key: 'rest', label: 'Diğer', amount: 0, share: 0 }),
    ]
    : slices;

  const stroke = 18;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  /** Her dilimin başladığı yer: öncekilerin toplam uzunluğu. */
  const starts = shown.map((_, i) => shown.slice(0, i).reduce((a, s) => a + circumference * s.share, 0));

  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r}
            stroke={colors.surfaceSunken} strokeWidth={stroke} fill="none" />
          {shown.map((s, i) => {
            const length = circumference * s.share;
            return (
              <Circle
                key={s.key}
                cx={size / 2} cy={size / 2} r={r}
                stroke={palette[i]} strokeWidth={stroke} fill="none"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-starts[i]}
                rotation={-90} originX={size / 2} originY={size / 2}
              />
            );
          })}
        </Svg>
        <View style={styles.center}>
          <Text style={[typeScale.bodyStrong, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
            {formatKurus(total, { decimals: false })}
          </Text>
          <Text style={[typeScale.caption, { color: colors.textFaint }]}>{centerLabel}</Text>
        </View>
      </View>

      <View style={styles.legend}>
        {shown.map((s, i) => (
          <View key={s.key} style={styles.row}>
            <View style={[styles.swatch, { backgroundColor: palette[i] }]} />
            <Text style={[typeScale.body, { color: colors.textSoft, flex: 1 }]} numberOfLines={1}>
              {s.label}
            </Text>
            <Text style={[typeScale.body, { color: colors.text, fontVariant: ['tabular-nums'] }]}>
              {formatKurus(s.amount, { decimals: false })}
            </Text>
            <Text style={[typeScale.caption, styles.pct, { color: colors.textFaint }]}>
              %{Math.round(s.share * 100)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.lg },
  center: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  legend: { alignSelf: 'stretch', gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  swatch: { width: 12, height: 12, borderRadius: radius.sm },
  pct: { width: 40, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
