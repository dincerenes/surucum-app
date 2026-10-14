import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { SetupStep } from '@/components/setup-step';
import { Chip, ChipGrid } from '@/components/ui';
import {
  FUEL_TYPE_LABELS, type FuelType, TRANSMISSION_LABELS, TRANSMISSION_TYPES,
} from '@/db/schema/_shared';
import { toggleFuelSelection } from '@/lib/fuel-selection';
import { draftLabel, useSetupDraft } from '@/lib/setup-draft';
import { space, type as typeScale, useTheme } from '@/theme/use-theme';

const SELECTABLE: FuelType[] = ['gasoline', 'diesel', 'lpg', 'electric'];

/**
 * Kurulum 3 — yakıt tipi ve vites.
 *
 * Yakıtı bilmeden gerçek kâr hesaplanamaz; seçim kuralı (tek seçim,
 * yalnızca Benzin + LPG birlikte) `toggleFuelSelection`'da.
 */
export default function FuelGearStep() {
  const { colors } = useTheme();
  const { draft, update } = useSetupDraft();

  const valid = draft.fuels.length > 0 && draft.transmission != null;

  return (
    <SetupStep
      step={3}
      title={draftLabel(draft)}
      subtitle="Yakıt tipi ve vites."
      primary={{ label: 'Devam', onPress: () => router.push('/bakim'), disabled: !valid }}
    >
      <View style={styles.block}>
        <Text style={[styles.label, { color: colors.textSoft }]}>YAKIT</Text>
        <ChipGrid>
          {SELECTABLE.map((f) => (
            <Chip
              key={f}
              label={FUEL_TYPE_LABELS[f]}
              selected={draft.fuels.includes(f)}
              onPress={() => update({ fuels: toggleFuelSelection(draft.fuels, f) })}
            />
          ))}
        </ChipGrid>
        <Text style={[typeScale.caption, { color: colors.textFaint }]}>
          {'Birini seç. Dönüşümlü LPG\'li araçta benzine LPG\'yi de ekleyebilirsin.'}
        </Text>
      </View>

      <View style={styles.block}>
        <Text style={[styles.label, { color: colors.textSoft }]}>VİTES</Text>
        <ChipGrid>
          {TRANSMISSION_TYPES.map((t) => (
            <Chip
              key={t}
              label={TRANSMISSION_LABELS[t]}
              selected={draft.transmission === t}
              onPress={() => update({ transmission: t })}
            />
          ))}
        </ChipGrid>
      </View>
    </SetupStep>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.sm },
  label: { ...typeScale.label, textTransform: 'uppercase' },
});
