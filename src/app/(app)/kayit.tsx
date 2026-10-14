import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AboveKeyboard, AmountInput, Button, Chip, ChipGrid } from '@/components/ui';
import { useDbValue } from '@/db/use-db';
import {
  deleteExpense, deleteFuelLog, deleteRide, getExpense, getFuelLog, getRide,
  listActiveExpenseCategories, updateExpense, updateFuelLog, updateRide,
} from '@/db/repo';
import { useAuth } from '@/lib/auth/auth-context';
import { formatClock } from '@/lib/business-date';
import { type Kurus, formatAmountForInput, parseAmount } from '@/lib/money';
import { isKnownUnitPrice } from '@/lib/fuel-type-pick';
import { requestSync } from '@/sync/scheduler';
import { space, type as typeScale, useTheme } from '@/theme/use-theme';
import { SheetHeader, sheetStyles, useSheetTopInset } from '@/components/ui/sheet';

/** Düzenlenebilen kayıt türleri. Üçü de aynı ekrandan geçiyor. */
type RecordKind = 'sefer' | 'gider' | 'yakit';

const TITLES: Record<RecordKind, string> = {
  sefer: 'Yolcuyu düzenle',
  gider: 'Gideri düzenle',
  yakit: 'Yakıtı düzenle',
};

/**
 * Kayıt düzenleme ve silme.
 *
 * NEDEN ZORUNLU: sürücü tutarı araç hareket hâlindeyken yazıyor ve
 * 250 yerine 2500 yazdığında günün tamamı çöp oluyordu — düzeltmenin
 * hiçbir yolu yoktu. Girilen sayıya güvenmek, onu düzeltebilmekle
 * mümkün; düzeltilemeyen bir kayıt sürücüyü uygulamadan koparır.
 *
 * SİLME YUMUŞAK: `deleted_at` damgalanıyor, satır duruyor. Sert silme
 * senkronda kaydı diriltir (bkz. `_base.ts`).
 *
 * İş günü DEĞİŞTİRİLMİYOR. Kayıt hangi güne yazıldıysa orada kalıyor:
 * tutarı düzeltmek bir günü diğerine taşımamalı, yoksa iki günün özeti
 * birden kayar ve sürücü sebebini bulamaz.
 */
export default function EditRecordScreen() {
  const { colors } = useTheme();
  const sheetTop = useSheetTopInset();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ tur: RecordKind; id: string }>();
  const kind: RecordKind = params.tur ?? 'sefer';
  const id = params.id ?? '';
  const userId = user?.id ?? null;

  /**
   * Kimlik URL'den geliyor; kayıt yalnızca BU HESABINSA açılır. Başka bir
   * hesabın kaydı "bulunamadı" görünür — varlığı bile ele verilmez.
   */
  const record = useDbValue(() => {
    if (!id || !userId) return null;
    if (kind === 'sefer') return getRide(userId, id) ?? null;
    if (kind === 'gider') return getExpense(userId, id) ?? null;
    return getFuelLog(userId, id) ?? null;
  }, [kind, id, userId]);

  const categories = useDbValue(
    () => (kind === 'gider' && userId ? listActiveExpenseCategories(userId) : []),
    [kind, userId],
  );

  /**
   * Alanlar kaydın MEVCUT değeriyle açılıyor.
   *
   * Boş açsaydık sürücü yalnız bir alanı düzeltmek isteyip diğerlerini
   * sıfırlardı; düzeltme ekranı, düzeltmek istemediğini bozmamalı.
   */
  const [amount, setAmount] = useState<string | null>(null);
  const [price, setPrice] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);

  if (!record) {
    return (
      <View style={[sheetStyles.sheet, {
        backgroundColor: colors.background,
        paddingTop: sheetStyles.sheet.paddingTop + sheetTop,
      }]}>
        <SheetHeader title="Kayıt bulunamadı" />
        <Text style={[typeScale.body, { color: colors.textSoft }]}>
          Bu kayıt silinmiş olabilir.
        </Text>
      </View>
    );
  }

  const currentAmount =
    kind === 'sefer' ? (record as { grossAmountKurus: Kurus }).grossAmountKurus
    : kind === 'gider' ? (record as { amountKurus: Kurus }).amountKurus
    : (record as { totalAmountKurus: Kurus }).totalAmountKurus;

  const amountText = amount ?? formatAmountForInput(currentAmount);
  const parsedAmount = parseAmount(amountText);

  /**
   * Fiyatsız dolumda sütun 0 tutuyor ("bilinmiyor"); alan "0" diye değil
   * boş açılır. Yazılan fiyat da sıfır ya da eksi olamaz.
   */
  const storedPrice = kind === 'yakit'
    ? (record as { unitPriceKurus: Kurus }).unitPriceKurus : null;
  const currentPrice = isKnownUnitPrice(storedPrice) ? storedPrice : null;
  const priceText = price ?? formatAmountForInput(currentPrice);
  const parsedPrice = parseAmount(priceText);
  const priceValid = priceText.trim().length === 0 || isKnownUnitPrice(parsedPrice);

  const selectedCategory = categoryId
    ?? (kind === 'gider' ? (record as { categoryId: string }).categoryId : null);

  const valid = parsedAmount != null && parsedAmount > 0 && priceValid;

  function kaydet() {
    if (!valid || !userId) return;

    let saved: boolean;
    if (kind === 'sefer') {
      saved = updateRide(userId, id, { grossAmountKurus: parsedAmount as Kurus });
    } else if (kind === 'gider') {
      saved = updateExpense(userId, id, {
        amountKurus: parsedAmount as Kurus,
        ...(selectedCategory ? { categoryId: selectedCategory } : {}),
      });
    } else {
      /**
       * Hacim tutardan ve fiyattan YENİDEN türetiliyor. Tutar düzeltilip
       * hacim eski kalırsa litre fiyatı kendiliğinden değişmiş olur ve
       * kayıt kendi içinde çelişir.
       */
      const known = isKnownUnitPrice(parsedPrice);
      const volume = known
        ? Math.round((parsedAmount / parsedPrice) * 1000)
        : 0;
      saved = updateFuelLog(userId, id, {
        totalAmountKurus: parsedAmount as Kurus,
        unitPriceKurus: (known ? parsedPrice : 0) as Kurus,
        volumePer1000: volume,
      });
    }

    /**
     * Kayıt bu arada silinmiş olabilir (başka cihazdan inen silme). Ekran
     * kapanıp düzeltme yapılmış gibi davranmasın; sürücü kaydedilmediğini
     * görmeli.
     */
    if (!saved) {
      Alert.alert('Kayıt bulunamadı', 'Bu kayıt silinmiş olabilir. Düzeltme kaydedilmedi.');
      return;
    }

    requestSync();
    router.back();
  }

  /** Silme ONAY İSTER — tek dokunuşla kaybolan kayıt güveni bitirir. */
  function sil() {
    Alert.alert(
      'Kaydı sil',
      'Bu kayıt günün hesabından çıkarılacak. Geri alınamaz.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: () => {
            if (!userId) return;
            // Kayıt zaten yoksa silinecek bir şey de yok; ekran yine kapanır.
            if (kind === 'sefer') deleteRide(userId, id);
            else if (kind === 'gider') deleteExpense(userId, id);
            else deleteFuelLog(userId, id);
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
        contentContainerStyle={[sheetStyles.sheet, {
          backgroundColor: colors.background,
          paddingTop: sheetStyles.sheet.paddingTop + sheetTop,
        }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <SheetHeader title={TITLES[kind]} />

        <Text style={[typeScale.caption, { color: colors.textFaint }]}>
          {`${formatClock((record as { occurredAt: number }).occurredAt)}'te girildi`}
        </Text>

        {kind === 'gider' && categories.length > 0 ? (
          <View style={styles.block}>
            <Text style={[styles.label, { color: colors.textSoft }]}>NE İÇİN</Text>
            <ChipGrid>
              {categories.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  selected={selectedCategory === c.id}
                  onPress={() => setCategoryId(c.id)}
                />
              ))}
            </ChipGrid>
          </View>
        ) : null}

        <AmountInput
          label={kind === 'yakit' ? 'Ödediğin tutar' : 'Tutar'}
          value={amountText}
          onChangeText={setAmount}
        />

        {kind === 'yakit' ? (
          <AmountInput
            label="Litre fiyatı"
            value={priceText}
            onChangeText={setPrice}
            unit="₺/lt"
            hint={priceValid
              ? 'Zorunlu değil — girersen kaç litre aldığın hesaplanır.'
              : 'Litre fiyatı sıfırdan büyük olmalı. Bilmiyorsan boş bırak.'}
          />
        ) : null}

        <View style={styles.spacer} />

        <Button label="Kaydet" onPress={kaydet} disabled={!valid} />
        <Button label="Kaydı sil" variant="ghost" onPress={sil} />
      </ScrollView>
    </AboveKeyboard>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.sm },
  label: { ...typeScale.label, textTransform: 'uppercase' },
  spacer: { flex: 1, minHeight: space.md },
});
