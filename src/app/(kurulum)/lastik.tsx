import { router } from 'expo-router';

import { IntervalCostFields, SetupStep, intervalCostState } from '@/components/setup-step';
import { useSetupDraft } from '@/lib/setup-draft';

/**
 * Kurulum 5 — lastik değişimi: kaç km'de bir, dört lastik kaça.
 * Bilmeyen atlıyor; o kalem varsayılandan hesaplanıyor.
 */
export default function TireStep() {
  const { draft, update } = useSetupDraft();
  const state = intervalCostState(draft.tireKm, draft.tireCost);

  return (
    <SetupStep
      step={5}
      title="Lastik değişimi"
      subtitle="Lastiklerini kaç kilometrede bir değiştiriyorsun ve dört lastik kaça geliyor?"
      primary={{
        label: 'Devam', onPress: () => router.push('/deger'), disabled: state !== 'valid',
      }}
      skip={{
        label: 'Bilmiyorum, atla',
        onPress: () => {
          update({ tireKm: '', tireCost: '' });
          router.push('/deger');
        },
      }}
    >
      <IntervalCostFields
        km={draft.tireKm}
        cost={draft.tireCost}
        onKm={(tireKm) => update({ tireKm })}
        onCost={(tireCost) => update({ tireCost })}
        presets={[30_000, 40_000, 50_000]}
        kmLabel="Kaç km'de bir?"
        costLabel="Dört lastiğin maliyeti"
        costHint="Montaj ve balans dahil."
      />
    </SetupStep>
  );
}
