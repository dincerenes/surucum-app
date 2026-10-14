import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Notice } from '@/components/ui/notice';
import { TextLink } from '@/components/ui/text-link';
import { useAuth } from '@/lib/auth/auth-context';
import { KVKK_URL, PRIVACY_POLICY_URL, TERMS_URL, openLegalPage } from '@/lib/legal';
import { MIN_PASSWORD_LENGTH, validateEmail, validatePassword } from '@/lib/auth/auth-errors';
import { MAX_DISPLAY_NAME } from '@/lib/profile';
import { radius, space, type as typeScale, useTheme } from '@/theme/use-theme';
import { StatusBarScrim } from '@/components/ui';

export default function KayitScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signUp } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const e = validateEmail(email);
    const p = validatePassword(password);
    const c = password !== confirm ? 'Şifreler birbiriyle uyuşmuyor.' : null;
    const t = accepted ? null : 'Hesap açmak için kullanım koşullarını kabul etmelisin.';

    setEmailError(e);
    setPasswordError(p);
    setConfirmError(c);
    setTermsError(t);
    setFormError(null);
    if (e || p || c || t) return;

    setBusy(true);
    const result = await signUp(email, password, name);
    setBusy(false);

    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    if (result.needsEmailConfirmation) {
      setAwaitingConfirmation(true);
      return;
    }
    router.replace('/');
  }

  if (awaitingConfirmation) {
    return (
      <ScrollView contentContainerStyle={[styles.page, { paddingTop: insets.top + space.xxxl }]}>
        <Text style={[typeScale.title, { color: colors.text }]}>E-postanı doğrula</Text>
        <Notice tone="success">
          {`${email.trim()} adresine bir doğrulama bağlantısı gönderdik. Bağlantıya tıkladıktan sonra giriş yapabilirsin.`}
        </Notice>
        <Text style={[typeScale.caption, { color: colors.textFaint }]}>
          E-posta gelmediyse istenmeyen klasörünü kontrol et.
        </Text>
        <Button label="Giriş ekranına dön" variant="secondary" onPress={() => router.replace('/giris')} />
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.page, { paddingTop: insets.top + space.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={[typeScale.display, { color: colors.text }]}>Hesap oluştur</Text>
          <Text style={[typeScale.body, { color: colors.textSoft }]}>
            Kayıtların cihazında tutulur; hesap yalnızca yedekleme ve cihaz
            değiştirme için gerekli.
          </Text>
        </View>

        {formError ? <Notice tone="error">{formError}</Notice> : null}

        <View style={styles.form}>
          {/* İsteğe bağlı: Anasayfa'daki selamlama için. Boş geçen adsız selamlanır. */}
          <Field
            label="Adın"
            value={name}
            onChangeText={setName}
            placeholder="Örn. Enes"
            hint="Anasayfada seni adınla selamlarız. İstersen boş bırak."
            autoComplete="name"
            textContentType="givenName"
            autoCapitalize="words"
            maxLength={MAX_DISPLAY_NAME}
            editable={!busy}
          />

          <Field
            label="E-posta"
            value={email}
            onChangeText={(v) => { setEmail(v); setEmailError(null); }}
            placeholder="ornek@eposta.com"
            error={emailError}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            editable={!busy}
          />

          <Field
            label="Şifre"
            value={password}
            onChangeText={(v) => { setPassword(v); setPasswordError(null); }}
            placeholder="Şifre oluştur"
            error={passwordError}
            hint={`En az ${MIN_PASSWORD_LENGTH} karakter`}
            secure
            autoComplete="new-password"
            textContentType="newPassword"
            editable={!busy}
          />

          <Field
            label="Şifre tekrar"
            value={confirm}
            onChangeText={(v) => { setConfirm(v); setConfirmError(null); }}
            placeholder="Şifreni tekrar gir"
            error={confirmError}
            secure
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={submit}
            editable={!busy}
          />

          {/*
            Onay kutusu işaretli GELMİYOR: önceden işaretli kutu geçerli bir
            onay sayılmıyor. Metinlere dokunmak kutuyu değiştirmiyor, sayfayı
            açıyor.
          */}
          <View style={styles.consent}>
            <Pressable
              onPress={() => { setAccepted((v) => !v); setTermsError(null); }}
              disabled={busy}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: accepted }}
              accessibilityLabel="Kullanım Koşullarını kabul ediyorum"
              hitSlop={space.sm}
              style={[
                styles.box,
                {
                  borderColor: termsError ? colors.negative : accepted ? colors.accent : colors.border,
                  backgroundColor: accepted ? colors.accent : colors.surface,
                },
              ]}
            >
              {accepted ? (
                <Icon name={{ ios: 'checkmark', android: 'check' }} size={16} color={colors.accentText} />
              ) : null}
            </Pressable>
            <Text style={[typeScale.caption, styles.consentText, { color: colors.textSoft }]}>
              <Text onPress={() => openLegalPage(TERMS_URL)} accessibilityRole="link" style={[styles.link, { color: colors.accent }]}>
                Kullanım Koşulları
              </Text>
              {'\'nı okudum ve kabul ediyorum. Verilerimin '}
              <Text onPress={() => openLegalPage(KVKK_URL)} accessibilityRole="link" style={[styles.link, { color: colors.accent }]}>
                KVKK Aydınlatma Metni
              </Text>
              {' ve '}
              <Text onPress={() => openLegalPage(PRIVACY_POLICY_URL)} accessibilityRole="link" style={[styles.link, { color: colors.accent }]}>
                Gizlilik Politikası
              </Text>
              {'\'na göre işleneceğini okudum.'}
            </Text>
          </View>
          {termsError ? (
            <Text style={[typeScale.caption, { color: colors.negative }]}>{termsError}</Text>
          ) : null}

          <Button label="Hesap oluştur" onPress={submit} loading={busy} />
        </View>

        <View style={styles.signupRow}>
          <Text style={{ color: colors.textSoft }}>Zaten hesabın var mı?</Text>
          <TextLink label="Giriş yap" href="/giris" />
        </View>
      </ScrollView>
      <StatusBarScrim />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.xl },
  header: { gap: space.sm },
  form: { gap: space.lg },
  consent: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  box: {
    width: 24, height: 24, marginTop: 2,
    borderWidth: 2, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  consentText: { flex: 1 },
  link: { fontWeight: '600' },
  signupRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
