import { useLocalSearchParams } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageHeader, PeriodSummaryCard, ShiftCard, StatusBarScrim } from '@/components/ui';
import { useDbValue } from '@/db/use-db';
import { listPeriodRecords } from '@/db/repo';
import { useAuth } from '@/lib/auth/auth-context';
import { type MonthKey, formatMonthKey, isMonthKey, monthRange } from '@/lib/period';
import { space, type as typeScale, useTheme } from '@/theme/use-theme';

/**
 * Arşivde bir ay — Kayıtlar'la AYNI liste (`listPeriodRecords`): dönem
 * özeti ve o ayın vardiyaları. Vardiyaya dokununca detayı açılıyor.
 */
export default function ArchiveMonthScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const params = useLocalSearchParams<{ ay: string }>();
  const key = params.ay ?? '';

  const data = useDbValue(() => {
    const range = monthRange(key);
    if (!userId || !range) return null;
    return listPeriodRecords(userId, range.from, range.to);
  }, [userId, key]);

  const title = isMonthKey(key) ? formatMonthKey(key as MonthKey) : 'Ay bulunamadı';
  const currentYear = Number(key.slice(0, 4));

  return (
    <>
      <FlatList
        data={data?.items ?? []}
        keyExtractor={(item) => item.key}
        contentContainerStyle={[styles.page, { paddingTop: insets.top + space.lg }]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <PageHeader />
            <Text style={[typeScale.display, { color: colors.text }]}>{title}</Text>
            {data ? <PeriodSummaryCard totals={data.totals} /> : null}
          </View>
        }
        ListEmptyComponent={
          <Text style={[typeScale.body, { color: colors.textSoft }]}>Bu ayda vardiya yok.</Text>
        }
        renderItem={({ item }) => (
          <ShiftCard shift={item.data.shift} summary={item.data.summary} currentYear={currentYear} />
        )}
      />
      <StatusBarScrim />
    </>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.md },
  header: { gap: space.lg, marginBottom: space.xs },
});
