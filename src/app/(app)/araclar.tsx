import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, PageHeader, StatusBarScrim } from '@/components/ui';
import { useDbValue } from '@/db/use-db';
import {
  getOpenShift, getSettings, getVehicle, listActiveVehicles, listVehicleFuelTypes,
  updateSettings,
} from '@/db/repo';
import { FUEL_TYPE_LABELS } from '@/db/schema/_shared';
import { useAuth } from '@/lib/auth/auth-context';
import { resolveWorkingVehicle } from '@/lib/vehicle-resolve';
import { requestSync } from '@/sync/scheduler';
import { radius, space, type as typeScale, useTheme } from '@/theme/use-theme';

/**
 * Araçlarım — liste ve AKTİF ARAÇ seçimi.
 *
 * Aktif araç yalnızca bir etiket değil: yeni vardiya ona bağlanıyor ve
 * yıpranma payı onun oranından geliyor. Sürücü aracını değiştirdiğinde
 * seçimi yapabilmeli, yoksa yeni aracın kilometreleri eski aracın
 * oranıyla hesaplanır.
 *
 * Araç SİLİNMEZ, pasifleşir — silinseydi ona bağlı geçmiş vardiya ve
 * yakıt kayıtları sahipsiz kalır ve geçmiş raporlar bozulurdu.
 *
 * VARDİYA AÇIKKEN SEÇİM SONRAKİ VARDİYADA GEÇERLİ. Açık vardiya kendi
 * aracında kalır — seferi, yakıtı ve vardiya sonu ön dolgusu o araca
 * ait. Seçimi engellemiyoruz (akış bloklanmaz); iki etiketle hangisinin
 * şu an, hangisinin sonra geçerli olduğunu gösteriyoruz.
 */
export default function VehiclesScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const data = useDbValue(() => {
    if (!userId) return null;
    const vehicles = listActiveVehicles(userId);
    const openShift = getOpenShift(userId) ?? null;
    const shiftVehicle = openShift ? getVehicle(userId, openShift.vehicleId) ?? null : null;
    /** Çözümleme `useDriver` ile AYNI fonksiyondan — ikisi ayrışamaz. */
    const { next, diverged } = resolveWorkingVehicle(
      vehicles, getSettings(userId)?.defaultVehicleId, shiftVehicle,
    );
    return {
      activeId: next?.id ?? null,
      shiftVehicle,
      diverged,
      vehicles: vehicles.map((v) => ({
        vehicle: v,
        fuels: listVehicleFuelTypes(userId, v.id)
          .map((f) => FUEL_TYPE_LABELS[f.fuelType]).join(' + '),
      })),
    };
  }, [userId]);

  function sec(vehicleId: string) {
    if (!userId) return;
    updateSettings(userId, { defaultVehicleId: vehicleId });
    requestSync();
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={[styles.page, { paddingTop: insets.top + space.lg }]}
        showsVerticalScrollIndicator={false}
      >
        <PageHeader />

        <Text style={[typeScale.display, { color: colors.text }]}>Araçlarım</Text>

        {data?.shiftVehicle ? (
          <View style={[styles.note, { backgroundColor: colors.accentSoft }]}>
            <Text style={[typeScale.body, { color: colors.text }]}>
              {data.diverged
                ? `Açık vardiyan ${data.shiftVehicle.label} ile sürüyor. `
                  + 'Seçimin bir sonraki vardiyada geçerli olur.'
                : 'Açık vardiyan bu araçla sürüyor. Başka bir araç seçersen '
                  + 'bir sonraki vardiyada geçerli olur.'}
            </Text>
            <Pressable
              onPress={() => router.push('/vardiya-bitir')}
              accessibilityRole="button"
              hitSlop={space.sm}
            >
              <Text style={[typeScale.bodyStrong, { color: colors.accent }]}>
                Vardiyayı bitir
              </Text>
            </Pressable>
          </View>
        ) : null}

        {data?.vehicles.map(({ vehicle, fuels }) => {
          const active = data.activeId === vehicle.id;
          const onShift = data.shiftVehicle?.id === vehicle.id;
          /**
           * Vardiya yokken tek rozet: AKTİF. Vardiya açıkken iki soru var —
           * hangi araçla şu an çalışılıyor, hangisi sonra — ve iki rozet.
           */
          const badge = data.shiftVehicle == null
            ? (active ? 'AKTİF' : null)
            : onShift ? 'VARDİYADA'
            : active ? 'SONRAKİ VARDİYA'
            : null;

          return (
            <Pressable
              key={vehicle.id}
              onPress={() => sec(vehicle.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: active ? colors.accent : colors.border,
                  borderWidth: active ? 2 : 1,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <View style={styles.cardHead}>
                <Text style={[typeScale.title, { color: colors.text }]}>
                  {vehicle.label}
                </Text>
                {badge ? (
                  <Text style={[styles.badge, { color: colors.accent }]}>{badge}</Text>
                ) : null}
              </View>

              {fuels ? (
                <Text style={[typeScale.caption, { color: colors.textFaint }]}>{fuels}</Text>
              ) : null}


              <Pressable
                onPress={() => router.push({
                  pathname: '/arac-duzenle', params: { id: vehicle.id },
                })}
                accessibilityRole="button"
                hitSlop={space.sm}
                style={styles.edit}
              >
                <Text style={[typeScale.bodyStrong, { color: colors.accent }]}>
                  Düzenle
                </Text>
              </Pressable>
            </Pressable>
          );
        })}

        <Button
          label="Araç ekle"
          variant="secondary"
          plus
          onPress={() => router.push('/arac-duzenle')}
        />

        <Text style={[typeScale.caption, { color: colors.textFaint }]}>
          Araca dokunmak onu seçer. Yeni vardiyalar seçili araca yazılır;
          açık vardiya ve geçmiş kayıtlar kendi aracında kalır.
        </Text>
      </ScrollView>
      <StatusBarScrim />
    </>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.md },
  card: { borderRadius: radius.lg, padding: space.lg, gap: space.xs },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
  },
  badge: { ...typeScale.label, letterSpacing: 1 },
  note: { borderRadius: radius.md, padding: space.md, gap: space.sm },
  edit: { alignSelf: 'flex-start', paddingTop: space.sm, minHeight: 40 },
});
