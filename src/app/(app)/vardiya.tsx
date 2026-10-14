import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AboveKeyboard, AmountInput, AmountText, Button, RideList, SummaryRows, StatusBarScrim,
} from '@/components/ui';
import { SheetHeader } from '@/components/ui/sheet';
import { useDbValue } from '@/db/use-db';
import {
  deleteShift, getShift, listRidesInShift, listShiftCosts, readShiftSummaryInput,
  updateShiftTotals,
} from '@/db/repo';
import { useAuth } from '@/lib/auth/auth-context';
import { formatBusinessDate, formatClock } from '@/lib/business-date';
import { calculateDaySummary } from '@/lib/day-summary';
import {
  type Kurus, ZERO, add, formatAmountForInput, formatInteger, parseAmount,
} from '@/lib/money';
import { calculateShiftStats } from '@/lib/shift';
import { readDecimal } from '@/lib/number-input';
import { parseWholeKm } from '@/lib/whole-number';
import { requestSync } from '@/sync/scheduler';
import { radius, space, type as typeScale, useTheme } from '@/theme/use-theme';
import { upperTr } from '@/lib/text';

/**
 * Vardiya detayı — geçmiş bir vardiyanın tam dökümü ve DÜZELTİLMESİ.
 *
 * NEDEN ZORUNLU: vardiya sihirbazının her adımı atlanabilir ve atlanan
 * kilometre geri gelmiyordu. Sürücü "kaç km yaptın" sorusunu geçtiyse
 * o vardiyanın yıpranma payı kalıcı olarak sıfır kalıyor, gerçek kâr
 * satırı olduğundan iyi görünüyordu — üstelik ekran bunu söylüyor ama
 * sürücünün yapabileceği hiçbir şey yoktu. Düzeltilemeyen bir uyarı,
 * uyarı değil suçlamadır.
 *
 * Buradaki sayılar TEK BİR VARDİYANIN — günün değil: yalnızca bu
 * vardiyaya bağlı yolcular, giderler ve dolumlar. Üç satır düzeltme
 * alanları yazıldıkça CANLI yeniden hesaplanıyor; sürücü "km'yi girersem
 * ne değişir" sorusunun cevabını kaydetmeden görüyor.
 */
export default function ShiftDetailScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id ?? '';

  /**
   * Kimlik URL'den geliyor; vardiya yalnızca BU HESABINSA açılır. Yıpranma
   * oranı gün özetiyle AYNI kuraldan: önce vardiyanın kopyası, yoksa aynı
   * hesabın aracı — yoksa iki ekran farklı yıpranma gösterirdi.
   */
  const data = useDbValue(() => {
    if (!id || !userId) return null;
    const shift = getShift(userId, id);
    if (!shift) return null;

    const input = readShiftSummaryInput(userId, shift.id);
    if (!input) return null;

    const now = Date.now();
    const rides = listRidesInShift(userId, shift.id);
    const gross = rides.reduce((acc, r) => add(acc, r.grossAmountKurus), ZERO);
    /** Vardiyanın gider ve dolum satırları — dokununca düzenleniyor. */
    const costs = listShiftCosts(userId, shift.id);

    return {
      shift, rides, input, costs, now,
      stats: calculateShiftStats(shift, gross, rides.length, now),
    };
  }, [id, userId]);

  const [km, setKm] = useState<string | null>(null);
  const [hours, setHours] = useState<string | null>(null);
  const [commission, setCommission] = useState<string | null>(null);
  const [consumption, setConsumption] = useState<string | null>(null);
  const [price, setPrice] = useState<string | null>(null);

  if (!data) {
    return (
      <View style={[styles.page, {
        backgroundColor: colors.background, paddingTop: insets.top + space.xxl,
      }]}>
        <Text style={[typeScale.title, { color: colors.text }]}>Vardiya bulunamadı</Text>
        <Button label="Geri" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  const { shift, rides, stats, input, costs, now } = data;

  /** Alanlar kaydın MEVCUT değeriyle açılıyor; boş açmak veriyi siler. */
  const kmText = km ?? numberInput(shift.distanceKm);
  const hoursText = hours ?? (shift.workedMinutes
    ? numberInput(Math.round((shift.workedMinutes / 60) * 10) / 10) : '');
  const commissionText = commission ?? formatAmountForInput(shift.commissionKurus);
  const consumptionText = consumption
    ?? numberInput(shift.fuelConsumptionPer100Km
      ? shift.fuelConsumptionPer100Km / 1000 : null);
  const priceText = price ?? formatAmountForInput(shift.fuelPriceKurus);

  // Kilometre TAM SAYI: bulutta sütun integer, ondalık reddedilir.
  const kmValue = parseWholeKm(kmText);
  const hoursValue = readNumber(hoursText);
  const consumptionValue = readNumber(consumptionText);

  /** Tüketim ekranda lt/100km, veritabanında 100 km başına mililitre. */
  const consumptionPer100Km = consumptionValue != null
    ? Math.round(consumptionValue * 1000) : null;

  /**
   * Üç satır, gün özetiyle AYNI hesaptan — vardiya satırı düzeltme
   * alanlarındaki değerlerle değiştirilerek. Yakıt kuralı da aynı:
   * tüketim hesaplanıyorsa o, hesaplanmıyorsa bu vardiyaya bağlı dolumlar.
   */
  const live = calculateDaySummary({
    rides: input.rides,
    expenses: input.expenses,
    fuelLogs: input.fuelLogs,
    shifts: [{
      ...input.row,
      distanceKm: kmValue,
      workedMinutes: hoursValue != null ? Math.round(hoursValue * 60) : null,
      commissionKurus: parseAmount(commissionText) as Kurus | null,
      fuelConsumptionPer100Km: consumptionPer100Km,
      fuelPriceKurus: parseAmount(priceText) as Kurus | null,
    }],
    now,
  });

  function kaydet() {
    if (!userId) return;
    const saved = updateShiftTotals(userId, shift.id, {
      distanceKm: kmValue,
      workedMinutes: hoursValue != null ? Math.round(hoursValue * 60) : null,
      commissionKurus: parseAmount(commissionText) as Kurus | null,
      fuelConsumptionPer100Km: consumptionPer100Km,
      fuelPriceKurus: parseAmount(priceText) as Kurus | null,
    });
    // Vardiya bu arada silinmişse düzeltme yapılmış gibi kapanmıyoruz.
    if (!saved) {
      Alert.alert('Vardiya bulunamadı', 'Bu vardiya silinmiş olabilir. Düzeltme kaydedilmedi.');
      return;
    }
    requestSync();
    router.back();
  }

  /**
   * Vardiyayı silmek KAYITLARINI DA SİLER — yolcular, giderler, dolumlar.
   *
   * Her kayıt bir vardiyaya ait; vardiyası silinen kayıt hiçbir kartta
   * görünmez ama toplamlara girerdi. Sürücü ne silineceğini sayılarıyla
   * görüyor.
   */
  function sil() {
    Alert.alert(
      'Vardiyayı sil',
      rides.length + costs.length > 0
        ? `Bu vardiya, ${[
          rides.length > 0 ? `${rides.length} yolcu` : null,
          costs.length > 0 ? `${costs.length} gider/yakıt` : null,
        ].filter(Boolean).join(' ve ')} kaydıyla birlikte silinecek.`
        : 'Bu vardiya kaydı silinecek.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: () => {
            if (!userId) return;
            deleteShift(userId, shift.id);
            requestSync();
            router.back();
          },
        },
      ],
    );
  }

  return (
    <AboveKeyboard>
      <ScrollView
        contentContainerStyle={[styles.page, {
          backgroundColor: colors.background, paddingTop: insets.top + space.lg,
        }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <SheetHeader title="Vardiya" />

        <View style={styles.head}>
          <Text style={[styles.eyebrow, { color: colors.textFaint }]}>
            {upperTr(formatBusinessDate(shift.businessDate, 'long'))}
          </Text>
          <Text style={[typeScale.display, { color: colors.text }]}>
            {formatClock(shift.startedAt)}
            {shift.endedAt ? ` – ${formatClock(shift.endedAt)}` : ' – açık'}
          </Text>
        </View>

        <View style={styles.stats}>
          <Stat
            value={`${Math.floor(stats.durationMinutes / 60)}:${
              String(stats.durationMinutes % 60).padStart(2, '0')}`}
            label={stats.isDurationEstimated ? 'süre · tahmini' : 'süre'}
          />
          <Stat value={formatInteger(stats.rideCount)} label="yolcu" />
          <Stat
            value={stats.distanceKm != null ? formatInteger(stats.distanceKm) : '—'}
            label="km"
          />
        </View>

        <SummaryRows summary={live} />

        {costs.length > 0 ? (
          <View style={styles.costs}>
            <Text style={[styles.sectionLabel, { color: colors.textFaint }]}>GİDER VE YAKIT</Text>
            <View style={[styles.list, { borderColor: colors.border }]}>
              {costs.map((c, index) => (
                <Pressable
                  key={`${c.kind}:${c.id}`}
                  onPress={() => router.push({ pathname: '/kayit', params: { tur: c.kind, id: c.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.title} kaydını düzenle`}
                  style={({ pressed }) => [
                    styles.costRow,
                    index > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                    pressed && { backgroundColor: colors.surfaceSunken },
                  ]}
                >
                  <Text style={[typeScale.body, { color: colors.textFaint, fontVariant: ['tabular-nums'] }]}>
                    {formatClock(c.at)}
                  </Text>
                  <Text style={[typeScale.body, { color: colors.text, flex: 1 }]}>{c.title}</Text>
                  <AmountText value={c.amount} tone="cost" showMinus />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <Text style={[styles.sectionLabel, { color: colors.textSoft }]}>DÜZELT</Text>

        <AmountInput
          label="Kaç km yaptın?" value={kmText} onChangeText={setKm} unit="km"
          keyboard="number-pad"
          hint="Boş bırakılırsa yıpranma payı ve yakıt maliyeti hesaplanmaz."
        />
        <AmountInput
          label="Kaç saat çalıştın?" value={hoursText} onChangeText={setHours}
          unit="saat"
        />
        <AmountInput
          label="Uygulamaya ödenen komisyon" value={commissionText}
          onChangeText={setCommission}
        />
        <AmountInput
          label="Ortalama tüketim" value={consumptionText}
          onChangeText={setConsumption} unit="lt/100km"
        />
        <AmountInput
          label="Litre fiyatı" value={priceText} onChangeText={setPrice} unit="₺/lt"
        />

        {rides.length > 0 ? <RideList rides={rides} limit={50} /> : null}

        <View style={styles.foot}>
          <Button label="Kaydet" onPress={kaydet} />
          <Button label="Vardiyayı sil" variant="ghost" onPress={sil} />
        </View>
      </ScrollView>
      <StatusBarScrim />
    </AboveKeyboard>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: colors.surface }]}>
      <Text style={[typeScale.title, { color: colors.text, fontVariant: ['tabular-nums'] }]}>
        {value}
      </Text>
      <Text style={[typeScale.caption, { color: colors.textFaint }]}>{label}</Text>
    </View>
  );
}

/** Ondalık sayıyı düzenlenebilir metne çevirir — virgüllü, ayraçsız. */
function numberInput(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  return String(value).replace('.', ',');
}

/** Boş ve okunamayan girdi `null` — sıfıra DÜŞMEZ, yoksa pay sıfırlanır. */
function readNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const value = readDecimal(trimmed) ?? Number.NaN;
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    paddingHorizontal: space.xl,
    paddingBottom: space.xxxl,
    gap: space.lg,
  },
  head: { gap: space.xs },
  eyebrow: { ...typeScale.label, letterSpacing: 1 },
  stats: { flexDirection: 'row', gap: space.sm },
  stat: { flex: 1, borderRadius: radius.md, padding: space.md, gap: 2 },
  costs: { gap: space.xs },
  list: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  costRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    paddingHorizontal: space.md, paddingVertical: space.md,
  },
  sectionLabel: { ...typeScale.label },
  foot: { gap: space.sm, paddingTop: space.md },
});
