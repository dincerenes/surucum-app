import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AmountText } from './amount-text';
import type { Shift } from '@/db/schema/earnings';
import { formatBusinessDate, formatClock } from '@/lib/business-date';
import type { DaySummary } from '@/lib/day-summary';
import { formatInteger, formatKurus } from '@/lib/money';
import { formatDuration } from '@/lib/shift';
import { radius, space, type as typeScale, useTheme } from '@/theme/use-theme';

interface Props {
  shift: Shift;
  /** YALNIZCA bu vardiyanın özeti (`listShiftSummariesInRange`). */
  summary: DaySummary;
  /** Kart bu yıldan değilse tarihe yıl ekleniyor ("Tüm zamanlar"da). */
  currentYear: number;
}

/**
 * Kayıtlar'ın bir satırı — TEK VARDİYA.
 *
 * Eskiden liste gün gündü ve bir günün kartında o günün bütün vardiyaları
 * alt satırlar olarak duruyordu. Sürücü günü değil vardiyayı yaşıyor:
 * açıp kapattığı şey vardiya, saydığı şey vardiyanın yolcusu ve parası.
 *
 * Sağdaki büyük sayı CEBE KALAN. Açık vardiyada CİRO: komisyon ve yakıt
 * vardiya biterken soruluyor, bilinmeyen bir kesintiyi düşülmüş gibi
 * göstermek sayıya olan güveni bitirir (Sürüş ekranıyla aynı kural).
 *
 * Eksiği olan KAPANMIŞ vardiya işaretleniyor; dokununca açılan detayda
 * düzeltiliyor. Düzeltme yolu olmayan uyarı, uyarı değil suçlamadır.
 */
export function ShiftCard({ shift, summary, currentYear }: Props) {
  const { colors } = useTheme();
  const open = shift.endedAt == null;

  const year = Number(shift.businessDate.slice(0, 4));
  const date = formatBusinessDate(shift.businessDate, 'weekday')
    + (year !== currentYear ? ` ${year}` : '');

  const facts = [
    `${formatInteger(summary.rideCount)} yolcu`,
    summary.distanceKm != null ? `${formatInteger(summary.distanceKm)} km` : null,
    open ? null : `ciro ${formatKurus(summary.profit.revenue, { decimals: false })}`,
  ].filter(Boolean).join(' · ');

  const missing = open ? '' : [
    shift.distanceKm == null ? 'km eksik' : null,
    summary.completeness.shiftsMissingFuel > 0 ? 'yakıt bilinmiyor' : null,
    shift.commissionKurus == null ? 'komisyon boş' : null,
  ].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/vardiya', params: { id: shift.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${date} vardiyası`}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
          borderColor: open ? colors.positive : colors.border,
        },
      ]}
    >
      <View style={styles.top}>
        <View style={styles.when}>
          <Text style={[typeScale.bodyStrong, { color: colors.text }]} numberOfLines={1}>
            {date}
          </Text>
          <Text style={[typeScale.caption, { color: colors.textFaint }]}>
            {/* Açık vardiyada süre yok — saat vardiya bitince soruluyor. */}
            {open
              ? `açılış ${formatClock(shift.startedAt)}`
              : `${formatClock(shift.startedAt)} – ${formatClock(shift.endedAt!)} · ${
                formatDuration(summary.durationMinutes)}`}
          </Text>
        </View>

        <View style={styles.amount}>
          <AmountText
            value={open ? summary.profit.revenue : summary.profit.cashProfit}
            size="heading"
            tone={open ? 'plain' : 'signed'}
          />
          <Text style={[typeScale.caption, { color: open ? colors.positive : colors.textFaint }]}>
            {open ? 'açık · ciro' : 'cebe kalan'}
          </Text>
        </View>
      </View>

      <Text style={[typeScale.body, { color: colors.textSoft }]}>{facts}</Text>

      {missing ? (
        <Text style={[typeScale.caption, { color: colors.warning }]}>{missing}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  when: { flex: 1, gap: 2 },
  amount: { alignItems: 'flex-end', gap: 2 },
});
