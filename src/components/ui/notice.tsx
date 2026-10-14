import { StyleSheet, Text, View } from 'react-native';
import { radius, space, useTheme } from '@/theme/use-theme';

type Tone = 'info' | 'error' | 'success' | 'warning';

export function Notice({ tone = 'info', children }: { tone?: Tone; children: string }) {
  const { colors } = useTheme();

  const bg =
    tone === 'error' ? colors.negativeSoft
    : tone === 'success' ? colors.positiveSoft
    : tone === 'warning' ? colors.warningSoft
    : colors.accentSoft;

  const fg =
    tone === 'error' ? colors.negative
    : tone === 'success' ? colors.positive
    : tone === 'warning' ? colors.warning
    : colors.accent;

  return (
    <View style={[styles.wrap, { backgroundColor: bg, borderLeftColor: fg }]}>
      <Text style={[styles.text, { color: fg }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderLeftWidth: 3,
    borderRadius: radius.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  text: { fontSize: 14, lineHeight: 20 },
});
