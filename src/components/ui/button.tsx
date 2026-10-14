import {
  ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import { haptic } from '@/lib/haptics';
import { DURATION } from '@/lib/motion';
import { HIT_SIZE, radius, space, useTheme } from '@/theme/use-theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Basınca ne kadar küçülüyor. Hero daha çok: sürücü ona bakmadan
 * basıyor, parmağın altında "gömüldüğünü" hissetmeli.
 */
const PRESSED_SCALE = { normal: 0.97, hero: 0.95 } as const;

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  /**
   * `hero`: ekranın ana eylemi — daha yüksek, daha yuvarlak, artı işaretli.
   *
   * Sürücü bu butona günde kırk kez, çoğu zaman araç hareket hâlindeyken
   * basıyor. Diğer butonlarla aynı ölçüde olması onu aramaya zorluyor;
   * ayrı bir ölçü, başparmağın düşünmeden gittiği yer demek.
   */
  size?: 'normal' | 'hero';
  /** Etiketin solunda artı işareti — "ekle" eylemlerinde. */
  plus?: boolean;
}

export function Button({
  label, onPress, variant = 'primary', loading = false, disabled = false,
  style, size = 'normal', plus = false,
}: Props) {
  const { colors } = useTheme();
  const inactive = disabled || loading;
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  const bg =
    variant === 'primary' ? colors.accent
    : variant === 'danger' ? colors.negative
    : variant === 'secondary' ? colors.surface
    : 'transparent';

  const fg =
    variant === 'primary' ? colors.accentText
    : variant === 'danger' ? colors.surface
    : variant === 'ghost' ? colors.accent
    : colors.text;

  const border =
    variant === 'secondary' ? colors.borderStrong : 'transparent';

  return (
    <AnimatedPressable
      onPress={() => {
        // Hero ekranın ana eylemi: ince bir tık "bastın" der, kaydetme
        // titreşimi ayrı ve daha güçlü (`haptic.press`, kayıt ekranlarında).
        if (size === 'hero') haptic.tap();
        onPress();
      }}
      onPressIn={() => {
        scale.set(withTiming(PRESSED_SCALE[size], { duration: DURATION.fast / 2 }));
      }}
      onPressOut={() => {
        scale.set(withSpring(1, { damping: 14, stiffness: 320 }));
      }}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={[
        styles.base,
        size === 'hero' && styles.hero,
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: variant === 'secondary' ? 1 : 0,
          opacity: inactive ? 0.5 : 1,
        },
        style,
        pressStyle,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.content}>
          {plus ? <Plus color={fg} /> : null}
          <Text style={[styles.label, size === 'hero' && styles.heroLabel, { color: fg }]}>
            {label}
          </Text>
        </View>
      )}
    </AnimatedPressable>
  );
}

/** Ekranın altına sabitlenen buton grubu — klavye açıkken bile erişilebilir. */
export function ButtonRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

/** Artı işareti — iki çizgi, ikon paketi yok. */
function Plus({ color }: { color: string }) {
  return (
    <View style={styles.plus}>
      <View style={[styles.plusBar, { backgroundColor: color }]} />
      <View style={[styles.plusBar, styles.plusBarV, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: HIT_SIZE,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  hero: {
    minHeight: 64,
    borderRadius: radius.lg,
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  label: { fontSize: 16, fontWeight: '600' },
  heroLabel: { fontSize: 18, fontWeight: '700', letterSpacing: -0.2 },
  plus: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  plusBar: { position: 'absolute', width: 16, height: 2.5, borderRadius: 2 },
  plusBarV: { transform: [{ rotate: '90deg' }] },
  row: { gap: space.md },
});
