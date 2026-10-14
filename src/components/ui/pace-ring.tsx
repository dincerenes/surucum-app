import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, useAnimatedProps, useReducedMotion, useSharedValue, withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { Icon } from './icon';
import { DURATION } from '@/lib/motion';
import { type Pace, pacePercent } from '@/lib/pace';
import { type as typeScale, useTheme } from '@/theme/use-theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * "Normal vardiyan" halkası — bu vardiyanın cirosu, sürücünün tipik
 * vardiyasının cirosuna göre (`src/lib/pace.ts`).
 *
 * Hedef halkası DEĞİL: hedef cebe kalan üzerinden ve vardiya sürerken
 * cebe kalan bilinmiyor. Halka yalnızca ciroyu ciroyla karşılaştırıyor.
 *
 * Küçük duruyor: büyük sayının çevresine sığacak bir halka iPhone SE
 * genişliğinde rakamı ezerdi ve "Yolcu ekle" kaydırmadan erişilemezdi.
 * Ortada yüzde, normale ulaşınca onay işareti; renk de yeşile dönüyor —
 * renk körü için işaret ve yanındaki yazı aynı şeyi söylüyor.
 *
 * Dolgu her değişimde eskisinden yenisine akıyor; "Hareketi azalt"
 * açıksa doğrudan son hâlinde.
 */
export function PaceRing({ pace, size = 44 }: { pace: Pace; size?: number }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const stroke = Math.max(4, Math.round(size / 9));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const color = pace.reached ? colors.positive : colors.accent;

  /** İlk görünüşte sıfırdan dolar: halka ekrana "geliyor", öylece durmuyor. */
  const progress = useSharedValue(reduced ? pace.progress : 0);
  useEffect(() => {
    progress.value = reduced
      ? pace.progress
      : withTiming(pace.progress, {
        duration: DURATION.base, easing: Easing.out(Easing.cubic),
      });
  }, [pace.progress, reduced, progress]);

  const arc = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
    // Yuvarlak uç sıfırda bile nokta çiziyor; boş halka boş görünsün.
    strokeOpacity: progress.value > 0.001 ? 1 : 0,
  }));

  const percent = pacePercent(pace);

  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityLabel={pace.reached
        ? 'Normal vardiyana ulaştın'
        : `Normal vardiyana göre yüzde ${percent.slice(1)}`}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={colors.border} strokeWidth={stroke} fill="none"
        />
        <AnimatedCircle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          rotation={-90} originX={size / 2} originY={size / 2}
          animatedProps={arc}
        />
      </Svg>
      <View style={styles.center}>
        {pace.reached ? (
          <Icon name={{ ios: 'checkmark', android: 'check' }} size={size * 0.4} color={color} />
        ) : (
          <Text style={[typeScale.label, styles.percent, { color: colors.text }]}>
            {percent}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  percent: { letterSpacing: 0, fontVariant: ['tabular-nums'] },
});
