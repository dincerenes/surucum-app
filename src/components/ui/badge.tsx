import { StyleSheet, Text, View } from 'react-native';
import { radius, space, type as typeScale, useTheme } from '@/theme/use-theme';

interface BadgeProps {
  label: string;
  tone?: 'accent' | 'neutral';
}

/**
 * Küçük durum etiketi — dokunulamaz, salt bilgi.
 *
 * `Chip`'ten farkı bu: Chip seçilebilir bir filtre/seçenek, Badge ise
 * yalnızca bir durumu ("yeni", "aktif") özetleyen sabit bir pil.
 */
export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  const { colors } = useTheme();
  const bg = tone === 'accent' ? colors.accentSoft : colors.surfaceSunken;
  const fg = tone === 'accent' ? colors.accent : colors.textSoft;

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[typeScale.caption, styles.label, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  label: { fontWeight: '600' },
});
