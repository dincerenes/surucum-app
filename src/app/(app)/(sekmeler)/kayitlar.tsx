import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Icon, PeriodFilterBar, PeriodSummaryCard, ShiftCard, StatusBarScrim,
} from '@/components/ui';
import { useDbValue } from '@/db/use-db';
import { getFirstRecordDate, listPeriodRecords } from '@/db/repo';
import { useAuth } from '@/lib/auth/auth-context';
import { PERIOD_LABELS, type PeriodKey, periodBounds } from '@/lib/period';
import { useBusinessToday } from '@/lib/use-business-today';
import { HIT_SIZE, radius, space, type as typeScale, useTheme } from '@/theme/use-theme';

/**
 * Kayıtlar — VARDİYA VARDİYA.
 *
 * Sürücü günü değil vardiyayı yaşıyor: açıp kapattığı şey vardiya, gün
 * içinde iki vardiya olabiliyor ve gece vardiyası iki takvim gününe
 * yayılıyor. Eski gün kartı bir günün vardiyalarını alt satırlara
 * gömüyordu; her vardiya artık kendi kartında, kendi parasıyla.
 *
 * Üstte dönem filtresi ve HER FİLTREDE duran dönem özeti: sürücü "bu ay
 * kaç vardiya, kaç yolcu, ne kaldı" sorusunun cevabını listeyi
 * toplamadan görüyor. Sağ üstteki arşiv geçmiş ayları tek tek açıyor.
 *
 * Gider ve yakıt buradan GİRİLMİYOR — yalnızca açık vardiyada. "Vardiya
 * dışı" kayıt yok: her yolcu, gider ve dolum bir vardiyanın kartında;
 * kalemleri vardiya detayında düzeltiliyor.
 */
export default function RecordsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [period, setPeriod] = useState<PeriodKey>('month');
  // Gün dönünce dönem (bu hafta, bu ay) yeni güne göre yeniden kurulsun.
  const today = useBusinessToday(userId);

  const data = useDbValue(() => {
    if (!userId) return null;
    const now = Date.now();
    const oldest = period === 'all' ? getFirstRecordDate(userId) : null;
    const { from, to } = periodBounds(period, today, oldest);
    return {
      ...listPeriodRecords(userId, from, to, now),
      currentYear: Number(today.slice(0, 4)),
    };
  }, [userId, period, today]);

  return (
    <>
      <FlatList
        data={data?.items ?? []}
        keyExtractor={(item) => item.key}
        contentContainerStyle={[styles.page, { paddingTop: insets.top + space.lg }]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text style={[typeScale.display, { color: colors.text }]}>Kayıtlar</Text>
              <Pressable
                onPress={() => router.push('/arsiv')}
                accessibilityRole="button"
                accessibilityLabel="Aylık arşiv"
                hitSlop={space.sm}
                style={({ pressed }) => [styles.archive, {
                  backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
                  borderColor: colors.border,
                }]}
              >
                <Icon name={{ ios: 'archivebox', android: 'inventory_2' }} color={colors.accent} />
              </Pressable>
            </View>

            <PeriodFilterBar value={period} onChange={setPeriod} />

            {data ? <PeriodSummaryCard totals={data.totals} meta={PERIOD_LABELS[period]} /> : null}
          </View>
        }
        ListEmptyComponent={
          <View style={[styles.empty, { borderColor: colors.border }]}>
            <Text style={[typeScale.heading, { color: colors.text }]}>
              {PERIOD_LABELS[period]} için vardiya yok
            </Text>
            <Text style={[typeScale.body, { color: colors.textSoft }]}>
              Sürüş sekmesinden vardiya başlattığında her vardiya burada kendi
              kartında görünecek.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <ShiftCard
            shift={item.data.shift}
            summary={item.data.summary}
            currentYear={data?.currentYear ?? 0}
          />
        )}
      />
      <StatusBarScrim />
    </>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.md },
  header: { gap: space.md, marginBottom: space.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  archive: {
    width: HIT_SIZE, height: HIT_SIZE, borderRadius: radius.pill, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  empty: {
    borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.lg,
    padding: space.xl, gap: space.sm,
  },
});
