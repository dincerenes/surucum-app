import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '@/lib/auth/auth-context';
import { useTheme } from '@/theme/use-theme';

export default function AuthLayout() {
  const { session, restoring, cloudAvailable } = useAuth();
  const { colors } = useTheme();

  // Oturum geri yüklenirken yönlendirme yapma: yoksa oturumu olan kullanıcı
  // bir an giriş ekranını görüp sonra ana ekrana atlar.
  if (restoring) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  // Bulut hiç yapılandırılmamışsa auth diye bir şey yok — uygulama yerel
  // modda tam olarak çalışır. Kullanıcıyı giriş ekranında hapsetme.
  if (!cloudAvailable || session) {
    return <Redirect href="/" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
