import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AboveKeyboard, AmountInput, Button, Card, Chip, ChipGrid, PageHeader,
  SegmentedControl, SelectField, StatusBarScrim,
} from '@/components/ui';
import { useDbValue } from '@/db/use-db';
import {
  createVehicle, deactivateVehicle, getVehicle,
  isVehicleOnOpenShift, listActiveVehicles, listVehicleFuelTypes, setVehicleFuelTypes,
  updateSettings, updateVehicle,
} from '@/db/repo';
import {
  FUEL_TYPE_LABELS, type FuelType,
  TRANSMISSION_LABELS, TRANSMISSION_TYPES, type TransmissionType,
} from '@/db/schema/_shared';
import { useAuth } from '@/lib/auth/auth-context';
import { formatAmountForInput, formatInteger, parseAmount } from '@/lib/money';
import { toggleFuelSelection } from '@/lib/fuel-selection';
import {
  OTHER_OPTION, VEHICLE_KIND_OPTIONS, type VehicleKind, kindOf, makesFor, modelYears, modelsFor,
} from '@/lib/vehicle-catalog';
import { parseWholeKm } from '@/lib/whole-number';
import { requestSync } from '@/sync/scheduler';
import { space, type as typeScale, useTheme } from '@/theme/use-theme';

const SELECTABLE: FuelType[] = ['gasoline', 'diesel', 'lpg', 'electric'];

/**
 * Araç ekleme ve düzenleme.
 *
 * Sahiplik ve araç adı SORULMUYOR (13 Ekim 2026'da kaldırıldı): ilk 63
 * aracın hiçbirinde sahiplik "kendi aracım"dan değiştirilmemiş, hiçbirine
 * elle ad verilmemişti. Ad marka/model/yıldan üretiliyor; sahiplik
 * kayıtlı değerinde kalıyor (yeni araçta "kendi aracım").
 *
 * Yıpranma payının KENDİSİ ne soruluyor ne gösteriliyor (km başına
 * rakam 13 Ekim 2026'da kaldırıldı); yalnızca kalemleri giriliyor ve
 * kâr hesabında kullanılıyor.
 */
export default function VehicleEditScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const params = useLocalSearchParams<{ id?: string }>();
  const id = params.id ?? null;

  /**
   * Kimlik URL'den geliyor; araç yalnızca BU HESABINSA açılır. Bulunamayan
   * araç için ekleme formu AÇILMIYOR — sürücü düzenlediğini sanıp yeni bir
   * araç eklerdi.
   */
  const existing = useDbValue(() => {
    if (!id || !userId) return null;
    const vehicle = getVehicle(userId, id);
    if (!vehicle) return null;
    return { vehicle, fuels: listVehicleFuelTypes(userId, id).map((f) => f.fuelType) };
  }, [id, userId]);

  const otherVehicleCount = useDbValue(
    () => (userId ? listActiveVehicles(userId).filter((v) => v.id !== id).length : 0),
    [userId, id],
  );

  const [kind, setKind] = useState<VehicleKind | null>(null);
  const [make, setMake] = useState<string | null | undefined>(undefined);
  const [model, setModel] = useState<string | null | undefined>(undefined);
  const [year, setYear] = useState<string | null>(null);
  const [fuels, setFuels] = useState<FuelType[] | null>(null);
  const [odometer, setOdometer] = useState<string | null>(null);
  const [transmission, setTransmission] = useState<TransmissionType | null | undefined>(undefined);
  const [maintenanceIntervalKm, setMaintenanceIntervalKm] = useState<string | null>(null);
  const [maintenanceCost, setMaintenanceCost] = useState<string | null>(null);
  const [tireIntervalKm, setTireIntervalKm] = useState<string | null>(null);
  const [tireCost, setTireCost] = useState<string | null>(null);
  const [marketValue, setMarketValue] = useState<string | null>(null);

  const v = existing?.vehicle ?? null;
  const makeValue = make !== undefined ? make : v?.make ?? null;
  const modelValue = model !== undefined ? model : v?.model ?? null;
  const kindValue = kind ?? kindOf(v?.make, v?.model);
  const yearValue = year ?? (v?.modelYear ? String(v.modelYear) : null);
  const ownershipValue = v?.ownership ?? 'owned';
  const fuelValue = fuels ?? existing?.fuels ?? ['gasoline' as FuelType];
  const odometerText = odometer
    ?? (v?.initialOdometerKm ? String(v.initialOdometerKm) : '');
  const transmissionValue = transmission !== undefined ? transmission : v?.transmission ?? null;
  const maintenanceIntervalKmText = maintenanceIntervalKm
    ?? (v?.maintenanceIntervalKm ? formatInteger(v.maintenanceIntervalKm) : '');
  const maintenanceCostText = maintenanceCost ?? formatAmountForInput(v?.maintenanceCostKurus);
  const tireIntervalKmText = tireIntervalKm
    ?? (v?.tireIntervalKm ? formatInteger(v.tireIntervalKm) : '');
  const tireCostText = tireCost ?? formatAmountForInput(v?.tireCostKurus);
  const marketValueText = marketValue ?? formatAmountForInput(v?.marketValueKurus);

  /** Ad marka/model/yıldan; marka seçilmemişse eski ad kalır. */
  const derived = [makeValue, modelValue, yearValue]
    .filter((p) => p && p !== OTHER_OPTION).join(' ');
  const finalLabel = derived || v?.label || 'Aracım';

  const maintenanceIntervalKmValue = parseWholeKm(maintenanceIntervalKmText);
  const maintenanceCostKurusValue = parseAmount(maintenanceCostText);
  const tireIntervalKmValue = parseWholeKm(tireIntervalKmText);
  const tireCostKurusValue = parseAmount(tireCostText);
  const marketValueKurusValue = parseAmount(marketValueText);
  const valid = fuelValue.length > 0;

  function pickMake(next: string) {
    setMake(next);
    setModel(null);
  }

  /** Tür değişince marka ve model sıfırlanır — öbür listeden kalmasın. */
  function pickKind(next: VehicleKind) {
    setKind(next);
    setMake(null);
    setModel(null);
  }

  function toggleFuel(f: FuelType) {
    setFuels(toggleFuelSelection(fuelValue, f));
  }

  function kaydet() {
    if (!userId || !valid) return;
    const odometerKm = parseWholeKm(odometerText);
    // Boş bırakılan kalem `null`: o kalemin payı varsayılandan hesaplanır.
    const wearFields = {
      transmission: transmissionValue,
      maintenanceIntervalKm: maintenanceIntervalKmValue,
      maintenanceCostKurus: maintenanceCostKurusValue,
      tireIntervalKm: tireIntervalKmValue,
      tireCostKurus: tireCostKurusValue,
      marketValueKurus: marketValueKurusValue,
    };

    if (v) {
      const saved = updateVehicle(userId, v.id, {
        label: finalLabel,
        make: makeValue,
        model: modelValue,
        modelYear: yearValue ? Number(yearValue) : null,
        initialOdometerKm: odometerKm,
        ...wearFields,
      }, Date.now());
      if (!saved) {
        Alert.alert('Araç bulunamadı', 'Bu araç silinmiş olabilir. Değişiklik kaydedilmedi.');
        return;
      }
      setVehicleFuelTypes(userId, v.id, fuelValue);
    } else {
      const created = createVehicle(userId, {
        label: finalLabel,
        ownership: ownershipValue,
        fuelTypes: fuelValue,
        make: makeValue,
        model: modelValue,
        modelYear: yearValue ? Number(yearValue) : null,
        initialOdometerKm: odometerKm,
        ...wearFields,
      });
      /** Yeni eklenen araç aktif olur — sürücü onu kullanmak için ekledi. */
      updateSettings(userId, { defaultVehicleId: created.id });
    }

    requestSync();
    router.back();
  }

  /**
   * Son aracı pasifleştirmek ENGELLENİYOR.
   *
   * Araç yoksa uygulama kullanılamıyor (vardiya bir araca bağlanıyor) ve
   * sürücü kendini kurulum ekranında bulurdu. Yaptığı şeyin sonucunu
   * göremeyeceği bir eylemi sunmuyoruz.
   */
  function pasiflestir() {
    if (!v || !userId) return;
    /**
     * Açık vardiyanın aracı kaldırılamaz: vardiya bu araçla sürüyor ve
     * kalan seferleri, yakıtı ve vardiya sonu hesabı ona ait.
     */
    if (isVehicleOnOpenShift(userId, v.id)) {
      Alert.alert(
        'Vardiya bu araçla açık',
        'Bu araçla açık vardiyan var; önce vardiyayı bitir, sonra aracı kaldır.',
      );
      return;
    }
    if (otherVehicleCount === 0) {
      Alert.alert(
        'Tek aracın',
        'Bu aracı kaldırırsan uygulama kullanılamaz. Önce yeni bir araç ekle.',
      );
      return;
    }

    /**
     * Metin GERİ ALMA VAAT ETMİYOR. Eskiden "sonra geri alabilirsin"
     * diyordu ama kaldırılan aracı gösteren ya da geri getiren hiçbir
     * ekran yok; sürücü güvendiği bir yolu bulamazdı.
     */
    Alert.alert(
      'Aracı kaldır',
      'Araç listeden çıkar, geçmiş vardiya ve yakıt kayıtları durur. '
        + 'Kaldırılan araç listeye geri getirilemez; gerekirse yeniden eklersin.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Kaldır',
          style: 'destructive',
          onPress: () => {
            if (!userId) return;
            if (!deactivateVehicle(userId, v.id)) {
              Alert.alert('Araç kaldırılmadı', 'Araç bulunamadı ya da açık bir vardiyada kullanılıyor.');
              return;
            }
            requestSync();
            router.back();
          },
        },
      ],
    );
  }

  if (id && !existing) {
    return (
      <View style={[styles.page, {
        backgroundColor: colors.background, paddingTop: insets.top + space.xxl,
      }]}>
        <Text style={[typeScale.title, { color: colors.text }]}>Araç bulunamadı</Text>
        <Button label="Geri" variant="secondary" onPress={() => router.back()} />
      </View>
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
        <PageHeader />

        <Text style={[typeScale.display, { color: colors.text }]}>
          {v ? 'Aracı düzenle' : 'Araç ekle'}
        </Text>

        <SegmentedControl
          options={VEHICLE_KIND_OPTIONS} value={kindValue} onChange={pickKind}
          accessibilityLabel="Araç türü"
        />
        <SelectField
          label="Marka" value={makeValue} onChange={pickMake}
          options={makesFor(kindValue)} placeholder="Marka seç" searchable allowCustom
        />
        <SelectField
          label="Model" value={modelValue} onChange={setModel}
          options={modelsFor(makeValue, kindValue)} placeholder="Önce marka seç"
          disabled={makeValue == null} allowCustom
        />
        <SelectField
          label="Yıl" value={yearValue} onChange={setYear}
          options={modelYears()} placeholder="Yıl seç (isteğe bağlı)" searchable
        />

        <View style={styles.block}>
          <Text style={[styles.label, { color: colors.textSoft }]}>YAKIT</Text>
          <ChipGrid>
            {SELECTABLE.map((f) => (
              <Chip
                key={f}
                label={FUEL_TYPE_LABELS[f]}
                selected={fuelValue.includes(f)}
                onPress={() => toggleFuel(f)}
              />
            ))}
          </ChipGrid>
          <Text style={[typeScale.caption, { color: colors.textFaint }]}>
            {'Birini seç. Dönüşümlü LPG\'li araçta benzine LPG\'yi de ekleyebilirsin.'}
          </Text>
        </View>

        <AmountInput
          label="Kilometre" value={odometerText} onChangeText={setOdometer}
          unit="km" keyboard="number-pad" hint="Zorunlu değil."
        />

        <View style={styles.block}>
          <Text style={[styles.label, { color: colors.textSoft }]}>VİTES</Text>
          <ChipGrid>
            {TRANSMISSION_TYPES.map((t) => (
              <Chip
                key={t}
                label={TRANSMISSION_LABELS[t]}
                selected={transmissionValue === t}
                onPress={() => setTransmission(transmissionValue === t ? null : t)}
              />
            ))}
          </ChipGrid>
        </View>

        <Card title="Yıpranma hesabı">
          <Text style={[typeScale.caption, { color: colors.textFaint }]}>
            Bilmediğin kalemi boş bırak, varsayılan kullanılır.
          </Text>

          <AmountInput
            label="Periyodik bakım aralığı" value={maintenanceIntervalKmText}
            onChangeText={setMaintenanceIntervalKm} unit="km" keyboard="number-pad"
          />
          <AmountInput
            label="Bakım maliyeti" value={maintenanceCostText}
            onChangeText={setMaintenanceCost} unit="₺"
          />
          <AmountInput
            label="Lastik değişim aralığı" value={tireIntervalKmText}
            onChangeText={setTireIntervalKm} unit="km" keyboard="number-pad"
          />
          <AmountInput
            label="Lastik maliyeti" value={tireCostText}
            onChangeText={setTireCost} unit="₺"
          />
          <AmountInput
            label="Aracın ikinci el değeri" value={marketValueText}
            onChangeText={setMarketValue} unit="₺"
          />
        </Card>

        <View style={styles.foot}>
          <Button label="Kaydet" onPress={kaydet} disabled={!valid} />
          {v ? (
            <Button label="Aracı kaldır" variant="ghost" onPress={pasiflestir} />
          ) : null}
        </View>
      </ScrollView>
      <StatusBarScrim />
    </AboveKeyboard>
  );
}

const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    paddingHorizontal: space.xl,
    paddingBottom: space.xxxl,
    gap: space.lg,
  },
  block: { gap: space.sm },
  label: { ...typeScale.label, textTransform: 'uppercase' },
  foot: { gap: space.sm, paddingTop: space.md },
});
