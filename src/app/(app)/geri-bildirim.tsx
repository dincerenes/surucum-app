import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Chip, ChipRow, Notice, PageHeader, StatusBarScrim } from '@/components/ui';
import {
  FEEDBACK_CATEGORIES, FEEDBACK_LABELS, type FeedbackCategory, MAX_FEEDBACK, sendFeedback,
} from '@/lib/feedback';
import { formatInteger } from '@/lib/money';
import { radius, space, type as typeScale, useTheme } from '@/theme/use-theme';

/**
 * Geri bildirim — uygulamanın İÇİNDEN, e-posta adresi göstermeden.
 *
 * Mesaj doğrudan buluta gidiyor; sürücü destek adresini görmüyor ve e-posta
 * uygulamasına atılmıyor. Tür seçimi (hata/istek/öneri) okurken ayırmak
 * için; varsayılan "Öneri", çünkü en çok gelen o.
 */
export default function FeedbackScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [category, setCategory] = useState<FeedbackCategory>('oneri');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);

  async function gonder() {
    setBusy(true);
    setError(null);
    const result = await sendFeedback(category, message);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <View style={[styles.page, { paddingTop: insets.top + space.lg }]}>
        <PageHeader />
        <Text style={[typeScale.display, { color: colors.text }]}>Teşekkürler</Text>
        <Notice tone="success">
          Mesajın bize ulaştı. Her birini okuyoruz; uygulamayı senin gibi sürücülerin
          söyledikleriyle geliştiriyoruz.
        </Notice>
        <Button label="Profile dön" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.page, { paddingTop: insets.top + space.lg }]}
        keyboardShouldPersistTaps="handled"
      >
        <PageHeader />
        <Text style={[typeScale.display, { color: colors.text }]}>Geri bildirim</Text>
        <Text style={[typeScale.body, { color: colors.textSoft }]}>
          Bir hata mı buldun, bir şey mi eksik? Yaz, doğrudan bize gelsin.
        </Text>

        {error ? <Notice tone="error">{error}</Notice> : null}

        <Card title="Konu">
          <ChipRow>
            {FEEDBACK_CATEGORIES.map((c) => (
              <Chip
                key={c}
                label={FEEDBACK_LABELS[c]}
                selected={category === c}
                onPress={() => setCategory(c)}
              />
            ))}
          </ChipRow>
        </Card>

        <Card title="Mesajın" meta={`${formatInteger(message.length)} / ${formatInteger(MAX_FEEDBACK)}`}>
          <TextInput
            value={message}
            onChangeText={(v) => { setMessage(v); setError(null); }}
            placeholder="Ne oldu, ne istersin? Ne kadar ayrıntı, o kadar iyi."
            placeholderTextColor={colors.textFaint}
            multiline
            maxLength={MAX_FEEDBACK}
            textAlignVertical="top"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            editable={!busy}
            style={[styles.input, typeScale.body, {
              color: colors.text,
              backgroundColor: colors.surfaceSunken,
              borderColor: focused ? colors.accent : 'transparent',
            }]}
          />
          <Text style={[typeScale.caption, { color: colors.textFaint }]}>
            Yolcu adı, telefon numarası, plaka gibi başkalarına ait bilgileri yazma.
          </Text>
        </Card>

        <Button label="Gönder" onPress={gonder} loading={busy} />
      </ScrollView>
      <StatusBarScrim />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.lg },
  input: {
    minHeight: 160, borderRadius: radius.md, borderWidth: 2, padding: space.md,
  },
});
