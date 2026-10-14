import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { type ScoreBand, scoreBand } from '@/lib/efficiency';
import { type as typeScale, useTheme } from '@/theme/use-theme';

/** Puan bandının rengi — renk körü için rakam ve etiket her zaman yanında. */
export function useScoreColor(): (score: number) => string {
  const { colors } = useTheme();
  const byBand: Record<ScoreBand, string> = {
    great: colors.positive,
    good: colors.accent,
    normal: colors.accent,
    low: colors.warning,
    poor: colors.negative,
  };
  return (score) => byBand[scoreBand(score)];
}

/**
 * Verimlilik puanı halkası — ortada rakam, çevresinde 0–100 yay.
 *
 * `score` boşsa halka boş ve ortada tire: "henüz puan yok" sıfır puan
 * değil.
 */
export function ScoreRing({ score, size = 88 }: { score: number | null; size?: number }) {
  const { colors } = useTheme();
  const colorFor = useScoreColor();
  const stroke = Math.max(6, Math.round(size / 10));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100;

  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityLabel={score == null ? 'Verimlilik puanı henüz yok' : `Verimlilik puanı ${score}`}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={colors.surfaceSunken} strokeWidth={stroke} fill="none"
        />
        {progress > 0 ? (
          <Circle
            cx={size / 2} cy={size / 2} r={r}
            stroke={colorFor(score!)} strokeWidth={stroke} fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - progress)}
            rotation={-90} originX={size / 2} originY={size / 2}
          />
        ) : null}
      </Svg>
      <View style={styles.center}>
        <Text style={[typeScale.title, {
          color: colors.text, fontSize: size * 0.3, lineHeight: size * 0.36,
          fontVariant: ['tabular-nums'],
        }]}>
          {score == null ? '—' : score}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
});
