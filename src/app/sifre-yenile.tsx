import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { useAuth } from '@/lib/auth/auth-context';
import { space, type as typeScale, useTheme } from '@/theme/use-theme';
import { StatusBarScrim } from '@/components/ui';

/**
 * Yeni şifre — e-postadaki sıfırlama bağlantısının açtığı ekran.
 *
 * GRUPLARIN DIŞINDA duruyor: `(auth)` oturumu olanı Anasayfa'ya,
 * `(app)` oturumu olmayanı girişe atıyor. Bağlantıdaki kod oturuma
 * çevrilirken ikisi de olabiliyor; sürücü şifresini yazmadan başka bir
 * ekrana savrulmamalı.
 *
 * Bağlantının işlenmesi (kodun oturuma çevrilmesi) `AuthProvider`'da;
 * bu ekran yalnızca durumu gösteriyor ve yeni şifreyi yazdırıyor.
 */
export default function SifreYenileScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    restoring, recovery, recoveryReady, recoveryError, updatePassword, cancelRecovery,
  } = useAuth();

  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    setFormError(null);
    if (password !== repeat) {
      setFormError('İki şifre birbirini tutmuyor.');
      return;
    }
    setBusy(true);
    const result = await updatePassword(password);
    setBusy(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setDone(true);
  }

  /**
   * Bağlantı açılışta işlenirken `restoring` açık kalıyor; o bitene kadar
   * "geçersiz" demek, doğru bağlantıyla gelen sürücüye bir an hata gösterirdi.
   * Bağlantısız gelinmişse (ekran başka yoldan açıldıysa) söylüyoruz.
   */
  const linkError = recoveryError
    ?? (!restoring && !recovery ? 'Bu ekran yalnızca e-postadaki bağlantıyla açılır.' : null);

  function leave(to: '/' | '/sifre-sifirla') {
    cancelRecovery();
    router.replace(to);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.page, { paddingTop: insets.top + space.xxxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={[typeScale.display, { color: colors.text }]}>Yeni şifre</Text>
          <Text style={[typeScale.body, { color: colors.textSoft }]}>
            Hesabın için yeni bir şifre belirle.
          </Text>
        </View>

        {done ? (
          <>
            <Notice tone="success">Şifren değişti. Bundan sonra yeni şifrenle giriş yap.</Notice>
            <Button label="Devam et" onPress={() => router.replace('/')} />
          </>
        ) : linkError ? (
          <>
            <Notice tone="error">{linkError}</Notice>
            <Button label="Yeni bağlantı iste" onPress={() => leave('/sifre-sifirla')} />
            <Button label="Vazgeç" variant="ghost" onPress={() => leave('/')} />
          </>
        ) : !recoveryReady ? (
          <View style={styles.waiting}>
            <ActivityIndicator color={colors.accent} />
            <Text style={[typeScale.body, { color: colors.textSoft }]}>Bağlantı doğrulanıyor…</Text>
          </View>
        ) : (
          <View style={styles.form}>
            {formError ? <Notice tone="error">{formError}</Notice> : null}
            <Field
              label="Yeni şifre"
              value={password}
              onChangeText={setPassword}
              placeholder="En az 8 karakter"
              secure
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="next"
              editable={!busy}
            />
            <Field
              label="Yeni şifre tekrar"
              value={repeat}
              onChangeText={setRepeat}
              placeholder="Aynı şifreyi yaz"
              secure
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={submit}
              editable={!busy}
            />
            <Button label="Şifreyi kaydet" onPress={submit} loading={busy} />
            <Button label="Vazgeç" variant="ghost" onPress={() => leave('/')} disabled={busy} />
          </View>
        )}
      </ScrollView>
      <StatusBarScrim />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.xl },
  header: { gap: space.sm },
  form: { gap: space.lg },
  waiting: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl },
});
