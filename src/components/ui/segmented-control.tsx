import { Pressable, StyleSheet, Text, View } from 'react-native';
import { HIT_SIZE, radius, space, type as typeScale, useTheme } from '@/theme/use-theme';

interface SegmentedControlProps<K extends string> {
  options: readonly { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  accessibilityLabel: string;
}

/**
 * Sekme anahtarı — aynı verinin farklı görünümleri arasında geçiş.
 *
 * Kasıtlı olarak vurgu rengiyle dolmuyor: aşağıdaki filtre çipleri (`Chip`)
 * seçiliyken vurgu rengiyle dolar. İkisi de dolu olsaydı "şu an neredeyim"
 * (sekme) ile "hangi verileri görüyorum" (filtre) ayrımı kaybolurdu.
 */
export function SegmentedControl<K extends string>({
  options, value, onChange, accessibilityLabel,
}: SegmentedControlProps<K>) {
  const { colors } = useTheme();

  return (
    <View
      style={[styles.track, { backgroundColor: colors.surfaceSunken, borderColor: colors.border }]}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => {
              if (!selected) onChange(option.key);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={({ pressed }) => [
              styles.segment,
              {
                backgroundColor: selected ? colors.surface : 'transparent',
                borderColor: selected ? colors.borderStrong : 'transparent',
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text
              style={[
                selected ? typeScale.bodyStrong : typeScale.body,
                { color: selected ? colors.text : colors.textSoft },
              ]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.xs,
    gap: space.xs,
  },
  segment: {
    flex: 1,
    minHeight: HIT_SIZE,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
