import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmountText, PageHeader, StatusBarScrim } from '@/components/ui';
import { useDbValue } from '@/db/use-db';
import { getFirstRecordDate, listDaySummaries } from '@/db/repo';
import { useAuth } from '@/lib/auth/auth-context';
import { formatInteger, formatKurus } from '@/lib/money';
import { type MonthKey, formatMonthKey, monthsBetween } from '@/lib/period';
import { type PeriodTotals, totalsByMonth } from '@/lib/stats';
import { useBusinessToday } from '@/lib/use-business-today';
import { radius, space, type as typeScale, useTheme } from '@/theme/use-theme';

interface MonthRow {
  key: MonthKey;
  totals: PeriodTotals | null;
}

/**
 * Aylık arşiv — ilk kayıttan bu aya her ay ayrı bir satır.
 *
 * KAYDI OLMAYAN AY DA LİSTEDE, soluk: aradaki boşluk sürücünün "o ay
 * çalışmadım" bilgisi. Atlasaydık Temmuz'dan Eylül'e geçen liste
 * Ağustos'un kaybolduğunu düşündürürdü. Boş ay açılmıyor.
 *
 * Toplamlar tek okumadan (`listDaySummaries` + `totalsByMonth`): ay başına
 * ayrı sorgu, yıllarca kaydı olan sürücüde ekranı dondururdu.
 */
export default function ArchiveScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  // Ay dönünce yeni ayın satırı listeye girsin.
  const today = useBusinessToday(userId);

  const months = useDbValue<MonthRow[]>(() => {
    if (!userId) return [];
    const oldest = getFirstRecordDate(userId);
    if (!oldest) return [];
    const totals = totalsByMonth(listDaySummaries(userId, oldest, today));
    return monthsBetween(oldest, today).map((key) => ({ key, totals: totals.get(key) ?? null }));
  }, [userId, today]);

  return (
    <>
      <FlatList
        data={months}
        keyExtractor={(m) => m.key}
        contentContainerStyle={[styles.page, { paddingTop: insets.top + space.lg }]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <PageHeader />
            <Text style={[typeScale.display, { color: colors.text }]}>Aylık arşiv</Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={[typeScale.body, { color: colors.textSoft }]}>
            Henüz kayıt yok. İlk vardiyanı bitirdiğinde ayın burada görünecek.
          </Text>
        }
        renderItem={({ item, index }) => {
          const year = item.key.slice(0, 4);
          const showYear = index === 0 || months[index - 1].key.slice(0, 4) !== year;
          return (
            <>
              {showYear ? (
                <Text style={[styles.year, { color: colors.textFaint }]}>{year}</Text>
              ) : null}
              <MonthCard row={item} />
            </>
          );
        }}
      />
      <StatusBarScrim />
    </>
  );
}

function MonthCard({ row }: { row: MonthRow }) {
  const { colors } = useTheme();
  const { totals } = row;
  const empty = totals == null || totals.dayCount === 0;

  return (
    <Pressable
      disabled={empty}
      onPress={() => router.push({ pathname: '/arsiv-ay', params: { ay: row.key } })}
      accessibilityRole="button"
      accessibilityLabel={formatMonthKey(row.key)}
      style={({ pressed }) => [styles.card, {
        backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
        borderColor: colors.border,
        opacity: empty ? 0.5 : 1,
      }]}
    >
      <View style={styles.cardText}>
        <Text style={[typeScale.heading, { color: colors.text }]}>{formatMonthKey(row.key)}</Text>
        <Text style={[typeScale.caption, { color: colors.textFaint }]}>
          {empty ? 'kayıt yok' : [
            `${formatInteger(totals.shiftCount)} vardiya`,
            `${formatInteger(totals.rideCount)} yolcu`,
            `ciro ${formatKurus(totals.revenue, { decimals: false })}`,
          ].join(' · ')}
        </Text>
      </View>
      {empty ? null : (
        <View style={styles.cardAmount}>
          <AmountText value={totals.cashProfit} size="bodyStrong" tone="signed" />
          <Text style={[typeScale.caption, { color: colors.textFaint }]}>cebe kalan</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.sm },
  header: { gap: space.lg, marginBottom: space.sm },
  year: { ...typeScale.label, marginTop: space.md },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    borderWidth: 1, borderRadius: radius.lg, padding: space.lg,
  },
  cardText: { flex: 1, gap: 2 },
  cardAmount: { alignItems: 'flex-end', gap: 2 },
});
