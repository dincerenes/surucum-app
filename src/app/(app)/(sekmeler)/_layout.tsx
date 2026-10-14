import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import {
  ChartIcon, DriveIcon, HomeIcon, ListIcon, PersonIcon,
} from '@/components/ui/tab-icon';
import { HIT_SIZE, space, useTheme } from '@/theme/use-theme';

/**
 * Beş sekme: Anasayfa · Kayıtlar · Sürüş · İstatistik · Profil
 *
 * "Sürüş" ortada ve ayrı bir sekme — açık vardiya bir DURUM değil, bir YER.
 * Sürücü gün boyu oraya dönüp sefer ekliyor; kaydırmadan ulaşabilmesi
 * gerekiyor ve sekme çubuğu her zaman ekranda.
 */
export default function TabsLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: HIT_SIZE + (Platform.OS === 'ios' ? 30 : 16),
          paddingTop: space.sm,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Anasayfa', tabBarIcon: HomeIcon }}
      />
      <Tabs.Screen
        name="kayitlar"
        options={{ title: 'Kayıtlar', tabBarIcon: ListIcon }}
      />
      <Tabs.Screen
        name="surus"
        options={{ title: 'Sürüş', tabBarIcon: DriveIcon }}
      />
      <Tabs.Screen
        name="istatistik"
        options={{ title: 'İstatistik', tabBarIcon: ChartIcon }}
      />
      <Tabs.Screen
        name="profil"
        options={{ title: 'Profil', tabBarIcon: PersonIcon }}
      />
    </Tabs>
  );
}
