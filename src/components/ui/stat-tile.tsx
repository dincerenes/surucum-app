import { StyleSheet, Text, View } from 'react-native';
import { radius, space, type as typeScale, useTheme } from '@/theme/use-theme';

/**
 * Küçük sayı kutusu — değer üstte, ne olduğu altta.
 *
 * İki sütunluk ızgarada kullanılıyor (`StatGrid`). Üç sütun denendi ve
 * altı haneli tutarlar kırpıldı — para asla kırpılmaz.
 */
export function StatTile({ value, label }: { value: string; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: colors.surfaceSunken }]}>
      <Text
        style={[typeScale.title, { color: colors.text, fontVariant: ['tabular-nums'] }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text style={[typeScale.caption, { color: colors.textFaint }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: {
    flexBasis: '48%',
    flexGrow: 1,
    borderRadius: radius.md,
    padding: space.md,
    gap: 2,
  },
});
