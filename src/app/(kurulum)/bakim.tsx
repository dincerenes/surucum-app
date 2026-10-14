import { router } from 'expo-router';

import { IntervalCostFields, SetupStep, intervalCostState } from '@/components/setup-step';
import { useSetupDraft } from '@/lib/setup-draft';

/**
 * Kurulum 4 — periyodik bakım: kaç km'de bir, kaça.
 *
 * Yıpranma payının bakım kalemi bundan çıkıyor (bkz. `lib/wear.ts`).
 * Bilmeyen atlıyor; o kalem varsayılandan hesaplanıyor.
 */
export default function MaintenanceStep() {
  const { draft, update } = useSetupDraft();
  const state = intervalCostState(draft.maintenanceKm, draft.maintenanceCost);

  return (
    <SetupStep
      step={4}
      title="Periyodik bakım"
      subtitle="Aracını kaç kilometrede bir bakıma sokuyorsun ve bir bakım ortalama kaça çıkıyor?"
      primary={{
        label: 'Devam', onPress: () => router.push('/lastik'), disabled: state !== 'valid',
      }}
      skip={{
        label: 'Bilmiyorum, atla',
        onPress: () => {
          update({ maintenanceKm: '', maintenanceCost: '' });
          router.push('/lastik');
        },
      }}
    >
      <IntervalCostFields
        km={draft.maintenanceKm}
        cost={draft.maintenanceCost}
        onKm={(maintenanceKm) => update({ maintenanceKm })}
        onCost={(maintenanceCost) => update({ maintenanceCost })}
        presets={[10_000, 15_000, 20_000]}
        kmLabel="Kaç km'de bir?"
        costLabel="Bir bakımın maliyeti"
        costHint="Yağ, filtreler ve işçilik dahil."
      />
    </SetupStep>
  );
}
