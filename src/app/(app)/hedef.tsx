import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmountInput, Button, Card, PageHeader, StatusBarScrim } from '@/components/ui';
import { useDbValue } from '@/db/use-db';
import { getActiveGoal, setGoal } from '@/db/repo';
import { useAuth } from '@/lib/auth/auth-context';
import { formatAmountForInput, parseAmount } from '@/lib/money';
import { requestSync } from '@/sync/scheduler';
import { space, type as typeScale, useTheme } from '@/theme/use-theme';
import { useState } from 'react';

/**
 * Günlük hedef — İSTEĞE BAĞLI.
 *
 * Eskiden kurulumun son adımıydı; sürücü "hedefi sonra, istersem
 * koyarım" dedi. Profil'deki satırdan açılıyor. Hedef ciroya değil cebe
 * kalana konur (bkz. `src/lib/goal.ts`). Tema Profil'e taşındı; gün
 * kesme saati artık ayar değil (bkz. `DEFAULT_CUTOFF_HOUR`).
 */
export default function GoalScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const data = useDbValue(() => {
    if (!userId) return null;
    return { goal: getActiveGoal(userId, 'daily') ?? null };
  }, [userId]);

  const [goalText, setGoalText] = useState<string | null>(null);

  const goalValue = goalText ?? formatAmountForInput(data?.goal?.targetNetKurus ?? null);

  function hedefKaydet() {
    if (!userId) return;
    setGoal(userId, parseAmount(goalValue));
    requestSync();
    router.back();
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={[styles.page, { paddingTop: insets.top + space.lg }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <PageHeader />

        <Text style={[typeScale.display, { color: colors.text }]}>Günlük hedef</Text>
        <Text style={[typeScale.body, { color: colors.textSoft }]}>
          Her gün cebinde kalmasını istediğin tutar. Anasayfada bir çubukla
          ne kadar yaklaştığını görürsün.
        </Text>

        <Card>
          <AmountInput
            label="Cebe kalan hedefi"
            value={goalValue}
            onChangeText={setGoalText}
            hint="Boş bırakırsan hedef gösterilmez. Hedef ciroya değil cebe kalana konur."
          />
          <Button label="Hedefi kaydet" onPress={hedefKaydet} />
        </Card>
      </ScrollView>
      <StatusBarScrim />
    </>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.lg },
});
