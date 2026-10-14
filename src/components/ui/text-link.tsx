import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { space, useTheme } from '@/theme/use-theme';

/**
 * Metin bağlantısı.
 *
 * expo-router'ın <Link> bileşeni yerine Pressable kullanılıyor: <Link>
 * dokunma alanını metnin tam sınırlarıyla eşitliyor ve araç kullanan birinin
 * tek elle isabet ettirmesi zorlaşıyor. Buradaki dolgu ve hitSlop, hedefi
 * parmak boyutuna çıkarıyor.
 */
export function TextLink({
  label, href, align = 'center',
}: { label: string; href: Href; align?: 'center' | 'left' }) {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(href)}
      accessibilityRole="link"
      hitSlop={12}
      style={({ pressed }) => [
        styles.wrap,
        { alignSelf: align === 'center' ? 'center' : 'flex-start', opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Text style={[styles.label, { color: colors.accent }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  label: { fontSize: 15, fontWeight: '600' },
});
