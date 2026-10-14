import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { HIT_SIZE, radius, space, type as typeScale, useTheme } from '@/theme/use-theme';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  /** Etiketin altında küçük ikincil metin — komisyon oranı, tutar. */
  detail?: string;
}

/**
 * Seçim çipi — kazanç kaynağı, gider kategorisi, ödeme yöntemi.
 *
 * Dokunma hedefi `HIT_SIZE`'ın altına inmiyor. Çipler görsel olarak küçük
 * duruyor ama sürücü bunlara araç hareket hâlindeyken dokunuyor.
 */
export function Chip({ label, selected = false, onPress, detail }: ChipProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.accent : colors.surface,
          borderColor: selected ? colors.accent : colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        style={[
          typeScale.bodyStrong,
          { color: selected ? colors.accentText : colors.text },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {detail ? (
        <Text
          style={[
            typeScale.caption,
            { color: selected ? colors.accentText : colors.textFaint, opacity: selected ? 0.8 : 1 },
          ]}
        >
          {detail}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * Yatay kaydırılabilir çip satırı.
 *
 * Kaydırma çubuğu gizli ve kenarlarda boşluk var: son çip ekranın
 * kenarına yapışırsa kaydırılabilir olduğu anlaşılmıyor.
 */
export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {children}
    </ScrollView>
  );
}

/** Sarmalayan çip ızgarası — gider kategorileri gibi sabit listeler için. */
export function ChipGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

const styles = StyleSheet.create({
  chip: {
    minHeight: HIT_SIZE,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  row: { gap: space.sm, paddingHorizontal: space.xs, paddingVertical: space.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
