import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AboveKeyboard, AmountInput, Button, Chip, ChipGrid,
} from '@/components/ui';
import { formatInteger, parseAmount } from '@/lib/money';
import { upperTr } from '@/lib/text';
import { parseWholeKm } from '@/lib/whole-number';
import { radius, space, type as typeScale, useTheme } from '@/theme/use-theme';

export const SETUP_STEPS = 6;

interface Props {
  step: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Ana buton. */
  primary: { label: string; onPress: () => void; disabled?: boolean };
  /** "Bilmiyorum, atla" gibi ikincil çıkış. */
  skip?: { label: string; onPress: () => void };
}

/**
 * Kurulum adımlarının ortak iskeleti: ilerleme çubuğu, geri, başlık,
 * kayan içerik ve altta sabit butonlar.
 *
 * İlerleme çubuğu şart: yedi adımlık bir sihirbazda sürücü sonun ne
 * kadar uzakta olduğunu göremezse yarıda bırakıyor.
 */
export function SetupStep({ step, title, subtitle, children, primary, skip }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <AboveKeyboard>
      <View style={[styles.page, { paddingTop: insets.top + space.lg }]}>
        <View style={styles.top}>
          {step > 1 ? (
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Geri"
              hitSlop={space.md}
            >
              <Text style={[typeScale.bodyStrong, { color: colors.accent }]}>‹ Geri</Text>
            </Pressable>
          ) : <View />}
          <Text style={[typeScale.caption, { color: colors.textFaint }]}>
            {`Adım ${step} / ${SETUP_STEPS}`}
          </Text>
        </View>

        <View style={[styles.track, { backgroundColor: colors.surfaceSunken }]}>
          <View style={[styles.fill, {
            width: `${(step / SETUP_STEPS) * 100}%`, backgroundColor: colors.accent,
          }]} />
        </View>

        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[typeScale.display, { color: colors.text }]}>{title}</Text>
          {subtitle ? (
            <Text style={[typeScale.body, { color: colors.textSoft }]}>{subtitle}</Text>
          ) : null}
          {children}

          {/*
            Butonlar İÇERİĞİN HEMEN ALTINDA, ekranın dibinde değil: az
            sorulu sayfada dibe yapışan buton alanlardan kopuk duruyordu
            ve sürücü ekranın yarısını boş görüyordu.
          */}
          <View style={styles.actions}>
            <Button
              label={primary.label}
              onPress={primary.onPress}
              disabled={primary.disabled}
            />
            {skip ? <Button label={skip.label} variant="ghost" onPress={skip.onPress} /> : null}
          </View>
        </ScrollView>
      </View>
    </AboveKeyboard>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: space.xl, paddingBottom: space.lg, gap: space.md },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  track: { height: 6, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: 6, borderRadius: radius.pill },
  body: { gap: space.lg, paddingTop: space.md, paddingBottom: space.xl },
  actions: { gap: space.xs, marginTop: space.xl },
  fields: { gap: space.lg },
  presetBlock: { gap: space.sm },
});

interface IntervalCostProps {
  km: string;
  cost: string;
  onKm: (raw: string) => void;
  onCost: (raw: string) => void;
  /** Hızlı seçim: sık görülen aralıklar. */
  presets: readonly number[];
  kmLabel: string;
  costLabel: string;
  costHint?: string;
}

/**
 * "Kaç km'de bir, kaça" sorusu — bakım ve lastik adımları aynı biçimde.
 * Hazır aralıklar dokunuşla dolduruluyor; alan elle de yazılabiliyor.
 */
export function IntervalCostFields({
  km, cost, onKm, onCost, presets, kmLabel, costLabel, costHint,
}: IntervalCostProps) {
  const { colors } = useTheme();
  const kmValue = parseWholeKm(km);

  return (
    <View style={styles.fields}>
      <View style={styles.presetBlock}>
        <Text style={[typeScale.label, { color: colors.textSoft }]}>{upperTr(kmLabel)}</Text>
        <ChipGrid>
          {presets.map((p) => (
            <Chip
              key={p}
              label={formatInteger(p)}
              selected={kmValue === p}
              onPress={() => onKm(formatInteger(p))}
            />
          ))}
        </ChipGrid>
        <AmountInput value={km} onChangeText={onKm} unit="km" keyboard="number-pad" />
      </View>
      <AmountInput label={costLabel} value={cost} onChangeText={onCost} unit="₺" hint={costHint} />
    </View>
  );
}

/** İki alan da boşsa atlanmış, ikisi de okunuyorsa tamam; tek dolu alan eksik. */
export function intervalCostState(km: string, cost: string): 'empty' | 'valid' | 'partial' {
  if (km.trim() === '' && cost.trim() === '') return 'empty';
  const k = parseWholeKm(km);
  const c = cost.trim() === '' ? null : parseAmount(cost);
  return k != null && k > 0 && c != null ? 'valid' : 'partial';
}
