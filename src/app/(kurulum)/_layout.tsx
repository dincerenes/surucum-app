import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/lib/auth/auth-context';
import { SetupDraftProvider } from '@/lib/setup-draft';
import { useDriver } from '@/lib/use-driver';
import { useTheme } from '@/theme/use-theme';

/**
 * İlk kurulum yığını.
 *
 * Oturum şart: kurulumda üretilen araç ve ayarlar bir kullanıcıya
 * bağlanıyor. Geri jesti kapalı — sürücü ekranı kazara kaydırıp
 * yarım kalmış bir kurulumla uygulamaya düşmemeli.
 *
 * Araç zaten varsa (ör. kurulum açıkken buluttan indi) kurulum kapanır:
 * aynı aracın ikinci kez eklenmesinin son savunması.
 */
export default function SetupLayout() {
  const { session, cloudAvailable } = useAuth();
  const { colors } = useTheme();
  const { needsSetup, userId } = useDriver();

  if (cloudAvailable && !session) return <Redirect href="/giris" />;
  if (userId && !needsSetup) return <Redirect href="/" />;

  return (
    <SetupDraftProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          gestureEnabled: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </SetupDraftProvider>
  );
}
