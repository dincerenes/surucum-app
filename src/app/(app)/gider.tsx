import { useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AboveKeyboard, AmountInput, Button, Chip, ChipGrid, DrivingNote } from '@/components/ui';
import { useDbValue } from '@/db/use-db';
import {
  WEAR_COVERED_CATEGORY_ICONS, addExpense, listActiveExpenseCategories, seedSystemCategories,
} from '@/db/repo';
import { type Kurus, parseAmount } from '@/lib/money';
import { haptic } from '@/lib/haptics';
import { useDriver } from '@/lib/use-driver';
import { requestSync } from '@/sync/scheduler';
import { space, type as typeScale, useTheme } from '@/theme/use-theme';
import { SheetHeader, sheetStyles, useSheetTopInset } from '@/components/ui/sheet';
import { ShiftRequired } from '@/components/ui/shift-required';

/**
 * Gider ekleme — çip seç, tutar yaz.
 *
 * Kategoriler serbest metin değil çip: sürücü hareket hâlindeki bir
 * araçta klavye açıp "otopark" yazmıyor, tek dokunuşla seçiyor.
 *
 * Yalnızca AÇIK VARDİYADA: gider o vardiyanın hesabına yazılıyor.
 */
export default function AddExpenseScreen() {
  const { colors } = useTheme();
  const sheetTop = useSheetTopInset();
  const { userId, vehicle, openShift } = useDriver();
  const [raw, setRaw] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const categories = useDbValue(() => {
    if (!userId) return [];
    seedSystemCategories(userId);
    return listActiveExpenseCategories(userId);
  }, [userId]);

  const amount = parseAmount(raw);
  const selected = categoryId ?? categories[0]?.id ?? null;
  const valid = amount != null && amount > 0 && selected != null;

  /**
   * Bakım, sigorta ve vergi kendi aracında yıpranma payının içinde
   * kabaca sayılıyor. Gideri reddetmiyoruz — sürücünün ödediği gerçek
   * para — ama aynı kalemi her ay "yıpranma" diye de düşmüş olmamak için
   * yalnızca o gün ödeneni yazmasını hatırlatıyoruz.
   */
  const category = categories.find((c) => c.id === selected);
  const overlapsWear = vehicle != null && vehicle.wearPerKmKurus > 0
    && category?.isSystem === true && WEAR_COVERED_CATEGORY_ICONS.has(category.icon ?? '');

  function kaydet() {
    if (!userId || !valid || !openShift) return;
    // Gün ve araç vardiyadan gelir (repo bunu kendisi çözer).
    addExpense(userId, {
      categoryId: selected,
      amountKurus: amount as Kurus,
      vehicleId: vehicle?.id ?? null,
      shiftId: openShift.id,
    });
    requestSync();
    haptic.press();
    router.back();
  }

  if (!openShift) return <ShiftRequired title="Gider ekle" />;

  return (
    <AboveKeyboard dismissOnTap>
      <View style={[sheetStyles.sheet, {
        backgroundColor: colors.background,
        paddingTop: sheetStyles.sheet.paddingTop + sheetTop,
      }]}>
        <SheetHeader title="Gider ekle" />

        <View style={styles.block}>
          <Text style={[styles.label, { color: colors.textSoft }]}>NE İÇİN</Text>
          <ChipGrid>
            {categories.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                selected={selected === c.id}
                onPress={() => setCategoryId(c.id)}
              />
            ))}
          </ChipGrid>
        </View>

        <AmountInput
          label="Tutar" value={raw} onChangeText={setRaw} autoFocus
          hint={overlapsWear
            ? 'Bakım, sigorta ve vergi yıpranma payının içinde kabaca sayılıyor; '
              + 'buraya yalnızca bugün ödediğini yaz.'
            : undefined}
        />

        <View style={styles.spacer} />
        <DrivingNote />
        <Button label="Kaydet" onPress={kaydet} disabled={!valid} />
      </View>
    </AboveKeyboard>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.sm },
  label: { ...typeScale.label, textTransform: 'uppercase' },
  spacer: { flex: 1, minHeight: space.md },
});
