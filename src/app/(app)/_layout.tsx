import { Redirect, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { useAuth } from '@/lib/auth/auth-context';
import { resolveSetupGate } from '@/lib/setup-gate';
import { useDriver } from '@/lib/use-driver';
import { onPullProgress } from '@/sync/progress';
import { syncNow } from '@/sync/scheduler';
import type { SyncTable } from '@/sync/tables';
import { useSync } from '@/sync/use-sync';
import { space, useTheme } from '@/theme/use-theme';

/**
 * Oturum bekçisi ve modal yığını.
 *
 * Sekmeler kendi grubunda (`(sekmeler)`); sefer ekleme, gider, yakıt ve
 * vardiya bitirme sihirbazı BU yığında duruyor. Sekme dizinine konsalardı
 * expo-router her birini ayrı bir sekme yapardı.
 */
export default function AppLayout() {
  const { session, restoring, cloudAvailable } = useAuth();
  const { colors } = useTheme();

  /** Senkron zamanlayıcısı oturum açıkken çalışır, çıkışta ya da hesap değişince durur. */
  const sync = useSync(session?.user.id ?? null);

  const { needsSetup } = useDriver();
  const [skipWait, setSkipWait] = useState(false);
  const hasVehicle = !needsSetup;
  const gate = resolveSetupGate({
    hasVehicle,
    downloaded: sync.downloaded,
    syncFailed: sync.lastError != null,
    skipWait,
  });
  const progress = useDownloadProgress(session?.user.id ?? null, gate === 'waiting');

  if (restoring) {
    return (
      <View style={{
        flex: 1, alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.background,
      }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  /**
   * Bulut yapılandırılmamışsa AÇIKÇA SÖYLENİYOR.
   *
   * Eskiden bu durumda sessizce devam ediliyor ve "yerel mod" olduğu
   * varsayılıyordu. Ama yerel modda kullanıcı kimliği ÜRETİLMİYOR:
   * `user` null kalıyor, her repo çağrısı hiçbir şey yapmıyor ve
   * kurulum hiç tamamlanamadığı için uygulama araç ekleme ekranında
   * sonsuza kadar kilitleniyordu. Sürücü ne olduğunu anlayamıyordu.
   *
   * Bu bir YAPILANDIRMA hatasıdır ve yalnızca ortam değişkenleri eksik
   * derlenmiş bir yapıda görülür; son kullanıcı bunu görmez. Yine de
   * sessiz kilitlenmektense ne olduğunu söylemek gerekiyor.
   *
   * (Kural 4 ihlal edilmiyor: arayüz hâlâ hiçbir ağ çağrısı beklemiyor.
   * Bulut yalnızca İLK GİRİŞ için gerekli; oturum açıldıktan sonra
   * uygulamanın tamamı çevrimdışı çalışıyor.)
   */
  if (!cloudAvailable) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]}>
          Uygulama yapılandırılmamış
        </Text>
        <Text style={[styles.body, { color: colors.textSoft }]}>
          Bulut adresi ve anahtarı bu yapıya girilmemiş, bu yüzden hesap
          açılamıyor. Bu bir kurulum hatası — uygulamayı derleyen kişinin
          düzeltmesi gerekiyor.
        </Text>
        <Text style={[styles.hint, { color: colors.textFaint }]}>
          EXPO_PUBLIC_SUPABASE_URL ve EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
        </Text>
      </View>
    );
  }

  if (!session) return <Redirect href="/giris" />;

  /**
   * Araç yoksa uygulama kullanılamaz: vardiya bir araca bağlanıyor,
   * yıpranma payı ondan geliyor. Kurulum atlanabilir bir adım değil.
   *
   * Ama "cihazda araç yok" ≠ "hesapta araç yok": önce bulut soruluyor
   * (bkz. `lib/setup-gate.ts`). Sormadan kuruluma atmak her yeni
   * kurulumda aynı aracı bir kez daha açtırıyordu.
   */
  if (gate === 'setup') return <Redirect href="/bilgiler" />;

  if (gate === 'waiting' || gate === 'sync_failed') {
    const failed = gate === 'sync_failed';
    const busy = progress.total > 0;
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        {failed ? null : <ActivityIndicator color={colors.accent} />}
        <Text style={[styles.title, { color: colors.text }]}>
          {failed ? 'Kayıtların indirilemedi' : busy ? 'Kayıtların yükleniyor' : 'Hesabın hazırlanıyor'}
        </Text>
        <Text style={[styles.body, { color: colors.textSoft }]}>
          {failed
            ? hasVehicle
              ? 'İnternet bağlantını kontrol edip tekrar dene. Kayıtların tamamı inmeden açarsan bazı rakamlar eksik görünebilir.'
              : 'İnternet bağlantını kontrol edip tekrar dene. Daha önce araç eklediysen buluttan gelmesini beklemek, aynı aracı yeniden eklemekten iyidir.'
            : 'Geçmiş kayıtların bu telefona iniyor. Bu yalnızca ilk girişte oluyor; sonra uygulama internetsiz de çalışır.'}
        </Text>
        {!failed && busy ? (
          <Text style={[styles.hint, { color: colors.textFaint }]}>
            {progress.label} · {progress.total.toLocaleString('tr-TR')} kayıt
          </Text>
        ) : null}
        {failed ? (
          <View style={styles.actions}>
            <Button label="Tekrar dene" onPress={syncNow} />
            <Button
              label={hasVehicle ? 'Yine de aç' : 'Yeni hesabım, kuruluma geç'}
              variant="ghost"
              onPress={() => setSkipWait(true)}
            />
          </View>
        ) : hasVehicle && progress.slow ? (
          <View style={styles.actions}>
            <Button label="Beklemeden aç" variant="ghost" onPress={() => setSkipWait(true)} />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(sekmeler)" />
      <Stack.Screen name="sefer" options={{ presentation: 'modal' }} />
      <Stack.Screen name="gider" options={{ presentation: 'modal' }} />
      <Stack.Screen name="yakit" options={{ presentation: 'modal' }} />
      <Stack.Screen name="kayit" options={{ presentation: 'modal' }} />
      <Stack.Screen name="vardiya" options={{ presentation: 'modal' }} />
      <Stack.Screen name="hedef" />
      <Stack.Screen name="profil-duzenle" />
      <Stack.Screen name="sss" />
      <Stack.Screen name="geri-bildirim" />
      <Stack.Screen name="araclar" />
      <Stack.Screen name="arsiv" />
      <Stack.Screen name="arsiv-ay" />
      <Stack.Screen name="arac-duzenle" />
      <Stack.Screen
        name="vardiya-bitir"
        options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
      />
    </Stack>
  );
}

/** Yükleme ekranında gösterilen ad — tablo adları sürücüye bir şey söylemiyor. */
const STEP: Partial<Record<SyncTable, string>> = {
  shifts: 'Vardiyalar',
  rides: 'Yolcular',
  expenses: 'Giderler',
  fuel_logs: 'Yakıt kayıtları',
};

/**
 * Sürücü beklerken "bir şey oluyor" demek yetmiyor; ne indiği ve kaç
 * kayıt olduğu görünsün. Uzun sürerse (zayıf bağlantı, yıllarca kayıt)
 * aracı inmiş sürücü beklemeyi atlayabilir: vardiyaya başlamak üzereyken
 * kapıda tutulmamalı.
 */
const SLOW_AFTER_MS = 10_000;

function useDownloadProgress(userId: string | null, active: boolean) {
  const [rows, setRows] = useState<Partial<Record<SyncTable, number>>>({});
  const [current, setCurrent] = useState<SyncTable | null>(null);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!active || !userId) return;
    const stop = onPullProgress((event) => {
      if (event.userId !== userId) return;
      setRows((prev) => ({ ...prev, [event.table]: event.rows }));
      setCurrent(event.table);
    });
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => { stop(); clearTimeout(timer); };
  }, [active, userId]);

  const total = Object.values(rows).reduce((sum, n) => sum + (n ?? 0), 0);
  const label = (current && STEP[current]) ?? 'Hesap bilgileri';
  return { total, label, slow };
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xxl,
    gap: space.md,
  },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 16, textAlign: 'center', lineHeight: 22 },
  hint: { fontSize: 12, textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: space.sm, marginTop: space.lg },
});
