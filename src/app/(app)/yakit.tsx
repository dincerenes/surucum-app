import { useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AboveKeyboard, AmountInput, Button, Chip, ChipRow, DrivingNote } from '@/components/ui';
import { useDbValue } from '@/db/use-db';
import { addFuelLog, listVehicleFuelTypes } from '@/db/repo';
import { FUEL_TYPE_LABELS, type FuelType } from '@/db/schema/_shared';
import { type Kurus, parseAmount } from '@/lib/money';
import { isKnownUnitPrice, pickPrimaryFuelType } from '@/lib/fuel-type-pick';
import { haptic } from '@/lib/haptics';
import { useDriver } from '@/lib/use-driver';
import { requestSync } from '@/sync/scheduler';
import { space, type as typeScale, useTheme } from '@/theme/use-theme';
import { SheetHeader, sheetStyles, useSheetTopInset } from '@/components/ui/sheet';
import { ShiftRequired } from '@/components/ui/shift-required';

/**
 * Yakıt dolumu.
 *
 * Kilometre sayacı SORULMUYOR — tam depo/sayaç zinciri kapsam dışı.
 * Buradaki kaydın iki işi var:
 *
 * - Litre fiyatını güncel tutmak: vardiya sonunda fiyat olarak önerilir.
 * - Tüketimi hesaplanamayan vardiyanın yakıtı olmak. YAKIT VARDİYA BAŞINA
 *   TEK SAYI: vardiyada km × tüketim × fiyat hesaplanabiliyorsa dolum
 *   AYRICA düşülmez (aynı yakıt iki kez düşülürdü). Vardiya açıkken
 *   girilen dolum o vardiyaya bağlanır; hiç vardiya olmayan günün depo
 *   alımı hesaba girmez, yalnızca fiyat kaynağıdır (bkz. `day-summary.ts`).
 *
 * Bu yüzden ekran dolumun "o gün cepten çıkan para" olarak düşüleceğini
 * vaat etmiyor; ipuçları kuralı söylüyor.
 */
export default function AddFuelScreen() {
  const { colors } = useTheme();
  const sheetTop = useSheetTopInset();
  const { userId, vehicle, openShift } = useDriver();
  const [total, setTotal] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [fuelType, setFuelType] = useState<FuelType | null>(null);

  const fuels = useDbValue(
    () => (userId && vehicle ? listVehicleFuelTypes(userId, vehicle.id) : []),
    [userId, vehicle?.id],
  );

  /**
   * Varsayılan çip BİRİNCİL yakıt — ön dolgunun okuduğu satır. En eski
   * tipte açıldığında LPG'ye geçmiş araçta dolum benzine yazılıyor ve
   * pompada girilen fiyat vardiya sonuna hiç ulaşmıyordu.
   */
  const selected = fuelType ?? pickPrimaryFuelType(fuels)?.fuelType ?? 'gasoline';
  const totalKurus = parseAmount(total);
  const priceKurus = parseAmount(unitPrice);

  /**
   * Fiyat isteğe bağlı, ama YAZILDIYSA geçerli olmalı. Sıfır ya da eksi
   * bir fiyat kayda "bilinmiyor" diye geçmez; sürücü yanlış yazmıştır.
   */
  const priceEntered = unitPrice.trim().length > 0;
  const priceValid = !priceEntered || isKnownUnitPrice(priceKurus);
  const valid = totalKurus != null && totalKurus > 0 && vehicle != null && priceValid;

  function kaydet() {
    if (!userId || !valid || !vehicle || !openShift) return;
    /**
     * Hacim birim fiyattan türetiliyor; fiyat girilmemişse sıfır kalıyor.
     * Sürücüye üç sayı birden yazdırmıyoruz — ödediği tutarı biliyor,
     * pompadaki litre fiyatını çoğu zaman hatırlıyor, litreyi hesaplamak
     * bizim işimiz.
     */
    const volume = isKnownUnitPrice(priceKurus)
      ? Math.round((totalKurus / priceKurus) * 1000)
      : 0;

    // Gün ve araç vardiyadan gelir (repo bunu kendisi çözer).
    addFuelLog(userId, {
      vehicleId: vehicle.id,
      shiftId: openShift.id,
      fuelType: selected,
      totalAmountKurus: totalKurus as Kurus,
      unitPriceKurus: (isKnownUnitPrice(priceKurus) ? priceKurus : 0) as Kurus,
      volumePer1000: volume,
      isFullTank: false,
    });
    requestSync();
    haptic.press();
    router.back();
  }

  if (!openShift) return <ShiftRequired title="Yakıt ekle" />;

  return (
    <AboveKeyboard>
      <ScrollView
        contentContainerStyle={[sheetStyles.sheet, {
          backgroundColor: colors.background,
          paddingTop: sheetStyles.sheet.paddingTop + sheetTop,
        }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <SheetHeader title="Yakıt ekle" />

        {fuels.length > 1 ? (
          <View style={styles.block}>
            <Text style={[styles.label, { color: colors.textSoft }]}>YAKIT</Text>
            <ChipRow>
              {fuels.map((f) => (
                <Chip
                  key={f.id}
                  label={FUEL_TYPE_LABELS[f.fuelType]}
                  selected={selected === f.fuelType}
                  onPress={() => setFuelType(f.fuelType)}
                />
              ))}
            </ChipRow>
          </View>
        ) : null}

        <AmountInput
          label="Ödediğin tutar" value={total} onChangeText={setTotal} autoFocus
          hint={openShift
            ? 'Vardiya sonunda ortalama tüketimi girersen yakıt tüketimden hesaplanır; bu tutar ayrıca düşülmez.'
            : 'Vardiya dışında alınan yakıt, o gün bu araçla vardiya yoksa hesaba ayrıca girmez — yakıt çalıştığın günlerde sayılır.'}
        />
        <AmountInput
          label="Litre fiyatı"
          value={unitPrice}
          onChangeText={setUnitPrice}
          unit="₺/lt"
          hint={priceValid
            ? 'Zorunlu değil — girersen bir sonraki vardiya sonunda litre fiyatı olarak önerilir.'
            : 'Litre fiyatı sıfırdan büyük olmalı. Bilmiyorsan boş bırak.'}
        />

        <View style={styles.spacer} />
        <DrivingNote />
        <Button label="Kaydet" onPress={kaydet} disabled={!valid} />
      </ScrollView>
    </AboveKeyboard>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.sm },
  label: { ...typeScale.label, textTransform: 'uppercase' },
  spacer: { flex: 1, minHeight: space.md },
});
