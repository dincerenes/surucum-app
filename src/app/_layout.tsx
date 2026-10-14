// Bu import HER ŞEYDEN ÖNCE gelmeli: uuid'in ihtiyaç duyduğu
// globalThis.crypto.getRandomValues'ı kuruyor.
import '@/lib/crypto-polyfill';

import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { getDb } from '@/db/client';
import { AuthProvider } from '@/lib/auth/auth-context';
import { ThemeProvider, space, useTheme } from '@/theme/use-theme';
import migrations from '../../drizzle/migrations';

/**
 * Sağlayıcılar İÇERİDE, tema dışarıda: `RootShell` kendi teması için
 * sağlayıcıya ihtiyaç duyuyor ve migration'lar koşmadan önce de çiziliyor.
 */
export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootShell />
    </ThemeProvider>
  );
}

function RootShell() {
  const { colors, scheme } = useTheme();
  const { success, error } = useMigrations(getDb(), migrations);

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorTitle, { color: colors.text }]}>
          Veritabanı hazırlanamadı
        </Text>
        <Text style={[styles.errorBody, { color: colors.textSoft }]}>{error.message}</Text>
        <Text style={[styles.hint, { color: colors.textFaint }]}>
          Uygulamayı kapatıp yeniden açın. Verileriniz cihazda duruyor, kaybolmadı.
        </Text>
      </View>
    );
  }

  if (!success) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
        <Text style={[styles.hint, { color: colors.textSoft }]}>Hazırlanıyor…</Text>
      </View>
    );
  }

  return (
    <AuthProvider>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Slot />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xxl,
    gap: space.md,
  },
  errorTitle: { fontSize: 18, fontWeight: '600' },
  errorBody: { fontSize: 14, textAlign: 'center' },
  hint: { fontSize: 13, textAlign: 'center' },
});
