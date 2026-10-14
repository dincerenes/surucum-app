import { StyleSheet, Text, View } from 'react-native';

import { AmountText } from './amount-text';
import type { GoalProgress } from '@/lib/goal';
import { radius, space, type as typeScale, useTheme } from '@/theme/use-theme';

/**
 * Günlük hedef çubuğu.
 *
 * Hedefin paydası CEBE KALAN — ciro değil. Ciroya konan hedef, yakıtı ve
 * komisyonu yok sayan bir başarı ölçüsüdür: sürücü çubuğu doldurur,
 * cebine bir şey girmez.
 *
 * ÇUBUK TAŞMAZ ve negatife inmez. Zarar edilen gün boş çubuk gösterir;
 * zararın kendisi üç satırda zaten kırmızı duruyor, burada ikinci kez
 * bağırmasına gerek yok.
 */
export function GoalBar({ goal }: { goal: GoalProgress }) {
  const { colors } = useTheme();
  const tint = goal.reached ? colors.positive : colors.accent;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={[styles.label, { color: colors.textFaint }]}>GÜNLÜK HEDEF</Text>
        {goal.reached ? (
          <Text style={[typeScale.caption, { color: colors.positive }]}>
            Hedef tamam
          </Text>
        ) : (
          <View style={styles.remaining}>
            <AmountText value={goal.remaining} size="caption" tone="plain" />
            <Text style={[typeScale.caption, { color: colors.textFaint }]}> kaldı</Text>
          </View>
        )}
      </View>

      <View style={[styles.track, { backgroundColor: colors.surfaceSunken }]}>
        <View
          style={[
            styles.fill,
            // Sıfır genişlikli bir dolgu çubuğu görünmez kılıyor; yuvarlak
            // uç en azından "başlandı ama az" demeyi sürdürüyor.
            { backgroundColor: tint, width: `${Math.max(goal.ratio * 100, 0)}%` },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: space.sm,
  },
  label: { ...typeScale.label, letterSpacing: 1 },
  remaining: { flexDirection: 'row', alignItems: 'baseline' },
  track: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
});
