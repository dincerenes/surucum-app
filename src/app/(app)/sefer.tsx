import { useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AboveKeyboard, AmountInput, Button, DrivingNote, ShiftRequired } from '@/components/ui';
import { addRide } from '@/db/repo';
import { type Kurus, parseAmount } from '@/lib/money';
import { haptic } from '@/lib/haptics';
import { useDriver } from '@/lib/use-driver';
import { requestSync } from '@/sync/scheduler';
import { space, useTheme } from '@/theme/use-theme';
import { SheetHeader, sheetStyles, useSheetTopInset } from '@/components/ui/sheet';

/**
 * Yolcu ekleme — TEK ALAN. (Kodda "sefer"/`rides`; sürücüye "yolcu":
 * her sefer bir yolcu sayılıyor.)
 *
 * Kazanç kaynağı seçimi yok (tek platform), komisyon yok (vardiya
 * sonunda tek rakam), ödeme yöntemi yok. Sürücü günde kırk kez buraya
 * giriyor; her fazladan alan o kırk kez tekrarlanan bir yük.
 *
 * Hedef: aç → yaz → kaydet, üç saniye.
 *
 * Yalnızca AÇIK VARDİYADA: her yolcu bir vardiyanın hesabına yazılıyor.
 * Eskiden vardiyasız da kaydediliyor ve hiçbir vardiya kartında
 * görünmüyordu.
 */
export default function AddRideScreen() {
  const { colors } = useTheme();
  const sheetTop = useSheetTopInset();
  const { userId, vehicle, openShift } = useDriver();
  const [raw, setRaw] = useState('');

  const amount = parseAmount(raw);
  const valid = amount != null && amount > 0;

  function kaydet() {
    if (!userId || !valid || !openShift) return;
    addRide(userId, {
      grossAmountKurus: amount as Kurus,
      shiftId: openShift.id,
      vehicleId: vehicle?.id ?? null,
    });
    requestSync();
    haptic.press();
    router.back();
  }

  if (!openShift) return <ShiftRequired title="Yolcu ekle" />;

  return (
    <AboveKeyboard dismissOnTap>
      <View style={[sheetStyles.sheet, {
        backgroundColor: colors.background,
        paddingTop: sheetStyles.sheet.paddingTop + sheetTop,
      }]}>
        <SheetHeader title="Yolcu ekle" />

        <AmountInput
          label="Tutar"
          value={raw}
          onChangeText={setRaw}
          autoFocus
          hint="Müşteriden aldığın tutarı yaz. Komisyonu vardiya sonunda soracağım."
        />

        <View style={styles.spacer} />

        <DrivingNote />
        <Button label="Kaydet" onPress={kaydet} disabled={!valid} />
      </View>
    </AboveKeyboard>
  );
}

const styles = StyleSheet.create({
  spacer: { flex: 1, minHeight: space.lg },
});
