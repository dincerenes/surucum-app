import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { WEEKDAYS_SHORT_TR } from '@/lib/business-date';
import { accentStep, radius, space, type as typeScale, useTheme } from '@/theme/use-theme';

const HEIGHT = 64;
const FLAME = 14;

interface Props {
  /** 0–1, en sakin günden en yoğuna YAYILMIŞ (bkz. `spread`). */
  values: readonly number[];
  best: readonly number[];
  todayIndex: number;
  accessibilityLabel: string;
}

/**
 * Hafta — yedi çubuk, en hareketli günlerin üstünde alev.
 *
 * Alev "en iyi gün" işareti; sürücü cümleyi okumadan Cuma'yı görüyor.
 * Bugün çerçeveli: hafta içinde nerede durduğunu bilmeden "Cuma en
 * yoğun" bilgisi yarım kalıyor.
 */
export function WeekBars({ values, best, todayIndex, accessibilityLabel }: Props) {
  const { colors } = useTheme();

  return (
    <View style={styles.row} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      {values.map((v, i) => {
        const today = i === todayIndex;
        return (
          <View key={i} style={styles.col}>
            <View style={styles.flame}>
              {best.includes(i) ? (
                <Icon name={{ ios: 'flame.fill', android: 'local_fire_department' }} size={FLAME}
                  color={colors.warning} />
              ) : null}
            </View>
            <View style={[styles.track, today && { borderColor: colors.text }]}>
              <View style={[styles.bar, {
                height: Math.max(6, v * HEIGHT), backgroundColor: accentStep(colors, v),
              }]} />
            </View>
            <Text style={[typeScale.caption, {
              color: today ? colors.text : colors.textFaint, fontWeight: today ? '700' : '400',
            }]}>
              {WEEKDAYS_SHORT_TR[i]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
  col: { flex: 1, alignItems: 'center', gap: space.xs },
  flame: { height: FLAME, justifyContent: 'center' },
  track: {
    width: '78%', height: HEIGHT + 6, justifyContent: 'flex-end', padding: 2,
    borderWidth: 1.5, borderColor: 'transparent', borderRadius: radius.sm,
  },
  bar: { borderRadius: radius.sm / 2 },
});
