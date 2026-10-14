import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { type DemandLevel, LEVEL_LABELS } from '@/lib/pusula';
import { space, type as typeScale, useTheme } from '@/theme/use-theme';

/** Kadranın çapı; yarım daire olduğu için yüksekliği bunun yarısı. */
const SIZE = 224;
const STROKE = 18;
const R = (SIZE - STROKE) / 2;
const CX = SIZE / 2;
const CY = SIZE / 2;
/** Dilimler arasındaki boşluk, radyan. */
const GAP = 0.035;
const NEEDLE = R - STROKE / 2 - 6;

/** Yay üzerindeki nokta — θ: π (sol uç) … 0 (sağ uç). */
function point(theta: number): string {
  return `${(CX + R * Math.cos(theta)).toFixed(2)} ${(CY - R * Math.sin(theta)).toFixed(2)}`;
}

function slicePath(i: number): string {
  const from = Math.PI - (i * Math.PI) / 4 - (i === 0 ? 0 : GAP);
  const to = Math.PI - ((i + 1) * Math.PI) / 4 + (i === 3 ? 0 : GAP);
  return `M ${point(from)} A ${R} ${R} 0 0 1 ${point(to)}`;
}

/**
 * Pusula kadranı — şu anki yoğunluk, ibreyle.
 *
 * Adı Pusula olan bir ekranın ilk görseli bir ibre: sürücü yazıyı
 * okumadan ibrenin sağa mı sola mı yattığını görüyor. Dört dilim dört
 * seviye; ibreye kadar olan dilimler renkli, ötesi gömük — gösterge
 * aynı zamanda dolgu çubuğu gibi okunuyor.
 *
 * SAYI YOK: ibrenin yeri bir ölçek değil, seviyenin içindeki yer.
 * Pusula tahmin; 0–100 bir rakam sürücüye kesinlik gibi görünür.
 *
 * İbre açılışta en soldan yerine dönüyor; "Hareketi azalt" açıksa
 * Reanimated doğrudan son yerine koyuyor.
 */
export function CompassDial({ level, ratio }: { level: DemandLevel; ratio: number }) {
  const { colors } = useTheme();
  const angle = useSharedValue(-90);

  useEffect(() => {
    angle.set(withDelay(150, withTiming(-90 + ratio * 180, {
      duration: 900, easing: Easing.out(Easing.back(1.4)),
    })));
  }, [ratio, angle]);

  const needleStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.get()}deg` }] }));

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Tahmini yoğunluk: ${LEVEL_LABELS[level]}`}
    >
      <View style={styles.dial}>
        <Svg width={SIZE} height={SIZE / 2 + STROKE / 2}>
          {[0, 1, 2, 3].map((i) => (
            <Path
              key={i}
              d={slicePath(i)}
              stroke={i <= level ? colors.accentScale[i + 1] : colors.surfaceSunken}
              strokeWidth={STROKE}
              strokeLinecap={i === 0 || i === 3 ? 'round' : 'butt'}
              fill="none"
            />
          ))}
        </Svg>
        <Animated.View style={[styles.needle, { backgroundColor: colors.text }, needleStyle]} />
        <View style={[styles.hub, { backgroundColor: colors.text }]}>
          <View style={[styles.hubDot, { backgroundColor: colors.surface }]} />
        </View>
      </View>
      <View style={styles.ends}>
        <Text style={[typeScale.caption, { color: colors.textFaint }]}>{LEVEL_LABELS[0]}</Text>
        <Text style={[typeScale.caption, { color: colors.textFaint }]}>{LEVEL_LABELS[3]}</Text>
      </View>
    </View>
  );
}

const HUB = 16;

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', alignSelf: 'center', width: SIZE },
  dial: { width: SIZE, height: SIZE / 2 + STROKE / 2 },
  needle: {
    position: 'absolute',
    left: CX - 2,
    top: CY - NEEDLE,
    width: 4,
    height: NEEDLE,
    borderRadius: 2,
    transformOrigin: '50% 100%',
  },
  hub: {
    position: 'absolute', left: CX - HUB / 2, top: CY - HUB / 2,
    width: HUB, height: HUB, borderRadius: HUB / 2, alignItems: 'center', justifyContent: 'center',
  },
  hubDot: { width: 6, height: 6, borderRadius: 3 },
  ends: {
    flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch',
    marginTop: space.xs,
  },
});
