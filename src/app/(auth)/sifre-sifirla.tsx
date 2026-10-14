import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { useAuth } from '@/lib/auth/auth-context';
import { validateEmail } from '@/lib/auth/auth-errors';
import { space, type as typeScale, useTheme } from '@/theme/use-theme';
import { StatusBarScrim } from '@/components/ui';

export default function SifreSifirlaScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { sendPasswordReset } = useAuth();

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const problem = validateEmail(email);
    setEmailError(problem);
    setFormError(null);
    if (problem) return;

    setBusy(true);
    const result = await sendPasswordReset(email);
    setBusy(false);

    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setSent(true);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.page, { paddingTop: insets.top + space.xxxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={[typeScale.display, { color: colors.text }]}>Şifreni sıfırla</Text>
          <Text style={[typeScale.body, { color: colors.textSoft }]}>
            Kayıtlı e-posta adresini gir, sıfırlama bağlantısını gönderelim.
          </Text>
        </View>

        {formError ? <Notice tone="error">{formError}</Notice> : null}

        {sent ? (
          <>
            <Notice tone="success">
              {`${email.trim()} adresine sıfırlama bağlantısı gönderildi. Bağlantıyı bu telefonda aç; uygulama yeni şifreni soracak.`}
            </Notice>
            <Button
              label="Giriş ekranına dön"
              variant="secondary"
              onPress={() => router.replace('/giris')}
            />
          </>
        ) : (
          <View style={styles.form}>
            <Field
              label="E-posta"
              value={email}
              onChangeText={(v) => { setEmail(v); setEmailError(null); }}
              placeholder="ornek@eposta.com"
              error={emailError}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="go"
              onSubmitEditing={submit}
              editable={!busy}
            />
            <Button label="Bağlantı gönder" onPress={submit} loading={busy} />
            <Button
              label="Vazgeç"
              variant="ghost"
              onPress={() => router.back()}
              disabled={busy}
            />
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
});
