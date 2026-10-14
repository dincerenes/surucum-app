import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { TextLink } from '@/components/ui/text-link';
import { useAuth } from '@/lib/auth/auth-context';
import { validateEmail } from '@/lib/auth/auth-errors';
import { space, type as typeScale, useTheme } from '@/theme/use-theme';
import { StatusBarScrim } from '@/components/ui';

export default function GirisScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const emailProblem = validateEmail(email);
    setEmailError(emailProblem);
    setFormError(null);
    if (emailProblem) return;
    if (!password) {
      setFormError('Şifreni gir.');
      return;
    }

    setBusy(true);
    const result = await signIn(email, password);
    setBusy(false);

    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    router.replace('/');
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
          <Text style={[typeScale.display, { color: colors.text }]}>Sürücüm</Text>
          <Text style={[typeScale.body, { color: colors.textSoft }]}>
            Kazancını, giderini ve gerçek kârını tek yerden takip et.
          </Text>
        </View>

        {formError ? <Notice tone="error">{formError}</Notice> : null}

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
            returnKeyType="next"
            editable={!busy}
          />

          <Field
            label="Şifre"
            value={password}
            onChangeText={setPassword}
            placeholder="Şifreni gir"
            secure
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
            editable={!busy}
          />

          <Button label="Giriş yap" onPress={submit} loading={busy} />
        </View>

        <View style={styles.links}>
          <TextLink label="Şifremi unuttum" href="/sifre-sifirla" />

          <View style={styles.signupRow}>
            <Text style={{ color: colors.textSoft }}>Hesabın yok mu?</Text>
            <TextLink label="Kayıt ol" href="/kayit" />
          </View>
        </View>
      </ScrollView>
      <StatusBarScrim />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.xl },
  header: { gap: space.sm, marginBottom: space.sm },
  form: { gap: space.lg },
  links: { alignItems: 'center' },
  signupRow: { flexDirection: 'row', alignItems: 'center' },
});
