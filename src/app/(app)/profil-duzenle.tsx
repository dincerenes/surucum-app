import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AVATAR_ICONS, Avatar, Button, Card, Field, Icon, PageHeader, SelectField, StatusBarScrim,
} from '@/components/ui';
import { getSettings, updateSettings } from '@/db/repo';
import { useDbValue } from '@/db/use-db';
import { useAuth } from '@/lib/auth/auth-context';
import { CITIES } from '@/lib/cities';
import {
  AVATAR_COLOR_COUNT, AVATAR_SYMBOLS, type AvatarChoice, MAX_DISPLAY_NAME, formatAvatar,
  initialOf, parseAvatar,
} from '@/lib/profile';
import { requestSync } from '@/sync/scheduler';
import { AVATAR_COLORS, radius, space, type as typeScale, useTheme } from '@/theme/use-theme';

/**
 * Profili düzenle — ad, şehir, avatar.
 *
 * Üçü de isteğe bağlı. Ad Anasayfa'daki selamlamada, şehir Profil'de
 * görünüyor. Avatar şimdilik HAZIR: bir sembol ve bir renk; fotoğraf
 * yükleme bulut depolaması gerektiriyor ve ayrı bir adım.
 *
 * Değerler ekranda taslak olarak tutuluyor, "Kaydet"e kadar yazılmıyor:
 * sürücü avatarları gezerken her dokunuş buluta gitmesin.
 */
export default function EditProfileScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const saved = useDbValue(() => (userId ? getSettings(userId) ?? null : null), [userId]);

  const [name, setName] = useState<string | null>(null);
  const [city, setCity] = useState<string | null | undefined>(undefined);
  const [choice, setChoice] = useState<AvatarChoice | null>(null);

  const nameValue = name ?? saved?.displayName ?? '';
  const cityValue = city === undefined ? saved?.city ?? null : city;
  const avatarValue = choice ?? parseAvatar(saved?.avatar);

  function kaydet() {
    if (!userId) return;
    updateSettings(userId, {
      displayName: nameValue,
      city: cityValue,
      avatar: formatAvatar(avatarValue),
    });
    requestSync();
    router.back();
  }

  const color = avatarValue.color ?? 0;

  return (
    <>
      <ScrollView
        contentContainerStyle={[styles.page, { paddingTop: insets.top + space.lg }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <PageHeader />
        <Text style={[typeScale.display, { color: colors.text }]}>Profili düzenle</Text>

        <View style={styles.preview}>
          <Avatar name={nameValue} avatar={formatAvatar(avatarValue)} size={96} />
        </View>

        <Card title="Avatar">
          <View style={styles.grid}>
            {AVATAR_SYMBOLS.map((symbol) => {
              const selected = avatarValue.symbol === symbol && avatarValue.color != null;
              return (
                <Pressable
                  key={symbol}
                  onPress={() => setChoice({ symbol, color })}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={symbol === 'harf' ? 'Baş harfim' : `Avatar ${symbol}`}
                  style={[styles.option, {
                    backgroundColor: AVATAR_COLORS[color],
                    borderColor: selected ? colors.text : 'transparent',
                  }]}
                >
                  {symbol === 'harf' ? (
                    <Text style={styles.optionLetter}>{initialOf(nameValue) ?? 'A'}</Text>
                  ) : (
                    <Icon name={AVATAR_ICONS[symbol]} size={24} color="#FFFFFF" />
                  )}
                </Pressable>
              );
            })}
          </View>

          <Text style={[typeScale.caption, { color: colors.textFaint }]}>Renk</Text>
          <View style={styles.colors}>
            {Array.from({ length: AVATAR_COLOR_COUNT }, (_, i) => (
              <Pressable
                key={i}
                onPress={() => setChoice({ symbol: avatarValue.symbol, color: i })}
                accessibilityRole="button"
                accessibilityState={{ selected: avatarValue.color === i }}
                accessibilityLabel={`Renk ${i + 1}`}
                style={[styles.swatch, {
                  backgroundColor: AVATAR_COLORS[i],
                  borderColor: avatarValue.color === i ? colors.text : 'transparent',
                }]}
              />
            ))}
          </View>
        </Card>

        <Card title="Bilgiler">
          <Field
            label="Adın"
            value={nameValue}
            onChangeText={setName}
            placeholder="Örn. Enes"
            hint="Anasayfada seni adınla selamlarız."
            autoCapitalize="words"
            autoComplete="name"
            textContentType="givenName"
            maxLength={MAX_DISPLAY_NAME}
          />
          <SelectField
            label="Şehir"
            value={cityValue}
            onChange={setCity}
            options={CITIES}
            placeholder="Şehrini seç"
            searchable
          />
          {user?.email ? (
            <Text style={[typeScale.caption, { color: colors.textFaint }]}>
              E-posta: {user.email} · e-posta buradan değiştirilemiyor.
            </Text>
          ) : null}
        </Card>

        <Button label="Kaydet" onPress={kaydet} />
      </ScrollView>
      <StatusBarScrim />
    </>
  );
}

const OPTION = 52;

const styles = StyleSheet.create({
  page: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.lg },
  preview: { alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  option: {
    width: OPTION, height: OPTION, borderRadius: OPTION / 2, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  optionLetter: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  colors: { flexDirection: 'row', gap: space.md, flexWrap: 'wrap' },
  swatch: { width: 36, height: 36, borderRadius: radius.pill, borderWidth: 3 },
});
