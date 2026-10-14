import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Avatar, BrandBadge, Button, Card, Icon, type IconName, StatusBarScrim,
} from '@/components/ui';
import { useDbValue } from '@/db/use-db';
import {
  THEME_LABELS, THEME_PREFERENCES, type ThemePreference, getActiveGoal, getSettings,
  listActiveVehicles, listVehicleFuelTypes,
} from '@/db/repo';
import { FUEL_TYPE_LABELS } from '@/db/schema/_shared';
import {
  KVKK_URL, PRIVACY_POLICY_URL, TERMS_URL, openLegalPage,
} from '@/lib/legal';
import { useAuth } from '@/lib/auth/auth-context';
import { formatKurus } from '@/lib/money';
import { useDriver } from '@/lib/use-driver';
import { pendingCount } from '@/sync/push';
import { getSyncStatus } from '@/sync/state';
import {
  HIT_SIZE, palette, radius, space, type as typeScale, useTheme,
} from '@/theme/use-theme';

/**
 * Profil — hesap, araçlar, tercihler, destek.
 *
 * Eskiden iki menü satırı ve bir "Ayarlar" sayfasıydı; sürücü aradığını
 * bulmak için içeri girmek zorundaydı. Şimdi her şey tek sayfada, önem
 * sırasıyla: kim olduğun, neyle çalıştığın, uygulamanın nasıl göründüğü,
 * yardım. Hesaptan çıkış ve hesabı silme en altta, kazara dokunulmasın.
 *
 * Hukuki metinler (kullanım koşulları, gizlilik, KVKK) kendi kartında,
 * tarayıcıda açılıyor (mağazalar uygulama içinden bağlantı istiyor).
 */
export default function ProfileScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, signOut, deleteAccount } = useAuth();
  const { vehicle: activeVehicle } = useDriver();
  const userId = user?.id ?? null;
  const [deleting, setDeleting] = useState(false);

  const info = useDbValue(() => {
    if (!userId) return null;
    const settings = getSettings(userId);
    return {
      name: settings?.displayName ?? null,
      city: settings?.city ?? null,
      avatar: settings?.avatar ?? null,
      vehicles: listActiveVehicles(userId).map((v) => ({
        vehicle: v,
        fuels: listVehicleFuelTypes(userId, v.id)
          .map((f) => FUEL_TYPE_LABELS[f.fuelType]).join(' + '),
      })),
      goal: getActiveGoal(userId, 'daily')?.targetNetKurus ?? null,
      synced: getSyncStatus(userId).lastSuccessAt != null,
      pending: pendingCount(userId),
    };
  }, [userId]);

  /**
   * Çıkışta kayıtlar normalde cihazda kalır. Ortak ya da elden çıkacak
   * telefon için cihazdan silme seçeneği var; yedeklenmemiş kayıt varsa
   * onların da gideceği ayrıca soruluyor.
   */
  function cikis() {
    const pending = info?.pending ?? 0;
    const wipe = () => { void signOut({ wipeDevice: true }); };
    Alert.alert('Çıkış yap', 'Hesabından çıkmak istiyor musun? Kayıtların bulutta yedekli kalır.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Çıkış yap', onPress: () => { void signOut(); } },
      {
        text: 'Çıkış yap ve bu telefondan sil',
        style: 'destructive',
        onPress: () => {
          if (pending === 0) { wipe(); return; }
          Alert.alert(
            'Yedeklenmemiş kayıt var',
            `${pending} kayıt henüz buluta gönderilmedi. Telefondan silersen bunlar kaybolur.`,
            [
              { text: 'Vazgeç', style: 'cancel' },
              { text: 'Yine de sil', style: 'destructive', onPress: wipe },
            ],
          );
        },
      },
    ]);
  }

  /**
   * Hesabı silme — İKİ ADIMLI onay. Geri dönüşü yok: bulut yedeği de
   * gidiyor. Mağazaların şartı, ama kazayla dokunulacak bir şey değil.
   */
  function hesabiSil() {
    Alert.alert(
      'Hesabını sil',
      'Hesabın ve bütün kayıtların (vardiyalar, yolcular, giderler, araçlar) '
        + 'bu cihazdan ve buluttan kalıcı olarak silinir. Bu geri alınamaz.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Devam et',
          style: 'destructive',
          onPress: () => Alert.alert(
            'Emin misin?',
            'Son kez soruyorum: hesabın ve tüm kayıtların silinecek.',
            [
              { text: 'Vazgeç', style: 'cancel' },
              { text: 'Hesabımı sil', style: 'destructive', onPress: () => { void sil(); } },
            ],
          ),
        },
      ],
    );
  }

  async function sil() {
    setDeleting(true);
    const result = await deleteAccount();
    setDeleting(false);
    if (!result.ok) Alert.alert('Hesap silinemedi', result.error);
  }

  const backup = info?.pending
    ? `${info.pending} kayıt yedeklenmeyi bekliyor`
    : info?.synced ? 'Tüm kayıtlar yedeklendi' : 'Kayıtların cihazında, bulut yalnızca yedek';

  return (
    <>
      <ScrollView
        contentContainerStyle={[styles.page, { paddingTop: insets.top + space.md }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerSide} />
          <Text style={[typeScale.heading, { color: colors.text }]}>Profil</Text>
          <View style={styles.headerSide}>
            {user ? (
              <Pressable
                onPress={cikis}
                accessibilityRole="button"
                accessibilityLabel="Çıkış yap"
                hitSlop={space.sm}
                style={({ pressed }) => [styles.iconButton, {
                  backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
                  borderColor: colors.border,
                }]}
              >
                <Icon
                  name={{ ios: 'rectangle.portrait.and.arrow.right', android: 'logout' }}
                  size={18}
                  color={colors.textSoft}
                />
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={[styles.identity, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Avatar name={info?.name} avatar={info?.avatar} size={88} />
          <View style={styles.identityText}>
            <Text style={[typeScale.title, { color: colors.text }]} numberOfLines={1}>
              {info?.name ?? 'Adını ekle'}
            </Text>
            {user?.email ? (
              <Text style={[typeScale.body, { color: colors.textSoft }]} numberOfLines={1}>
                {user.email}
              </Text>
            ) : null}
            <View style={styles.cityRow}>
              <Icon name={{ ios: 'mappin.and.ellipse', android: 'location_on' }} size={14}
                color={colors.textFaint} />
              <Text style={[typeScale.caption, { color: colors.textFaint }]}>
                {info?.city ?? 'Şehir seçilmedi'}
              </Text>
            </View>
          </View>
          <Button label="Profili düzenle" variant="secondary"
            onPress={() => router.push('/profil-duzenle')} style={styles.stretch} />
        </View>

        <Card title="Araçlarım" icon={{ ios: 'car.fill', android: 'directions_car' }}>
          {info?.vehicles.map(({ vehicle, fuels }, i) => (
            <Pressable
              key={vehicle.id}
              onPress={() => router.push('/araclar')}
              accessibilityRole="button"
              accessibilityLabel={`${vehicle.label}, araçlarımı aç`}
              style={({ pressed }) => [styles.vehicleRow, {
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.border,
                opacity: pressed ? 0.7 : 1,
              }]}
            >
              <BrandBadge make={vehicle.make} size={40} />
              <View style={styles.flex}>
                <Text style={[typeScale.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                  {vehicle.label}
                </Text>
                <Text style={[typeScale.caption, { color: colors.textFaint }]} numberOfLines={1}>
                  {[vehicle.model, vehicle.modelYear, fuels].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {activeVehicle?.id === vehicle.id ? (
                <Text style={[styles.active, { color: colors.accent, backgroundColor: colors.accentSoft }]}>
                  AKTİF
                </Text>
              ) : null}
            </Pressable>
          ))}
          <Pressable
            onPress={() => router.push('/arac-duzenle')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.addRow, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Icon name={{ ios: 'plus.circle.fill', android: 'add_circle' }} size={20} color={colors.accent} />
            <Text style={[typeScale.bodyStrong, { color: colors.accent }]}>Araç ekle</Text>
          </Pressable>
        </Card>

        <Card title="Tercihler" icon={{ ios: 'slider.horizontal.3', android: 'tune' }}>
          <Row
            icon={{ ios: 'target', android: 'track_changes' }}
            label="Günlük hedef"
            detail={info?.goal
              ? `${formatKurus(info.goal, { decimals: false })} cebe kalan`
              : 'Hedef yok — istersen ekle'}
            onPress={() => router.push('/hedef')}
            first
          />
          <Text style={[typeScale.caption, styles.subhead, { color: colors.textFaint }]}>Tema</Text>
          <ThemePicker />
        </Card>

        <Card title="Destek" icon={{ ios: 'questionmark.circle.fill', android: 'help' }}>
          <Row
            icon={{ ios: 'envelope.fill', android: 'mail' }}
            label="Geri bildirim gönder"
            detail="Hata, istek, öneri — uygulamadan doğrudan bize yaz"
            onPress={() => router.push('/geri-bildirim')}
            first
          />
          <Row
            icon={{ ios: 'book.fill', android: 'menu_book' }}
            label="Sık sorulan sorular"
            detail="Ciro, cebe kalan, yıpranma payı…"
            onPress={() => router.push('/sss')}
          />
        </Card>

        <Card title="Hukuki" icon={{ ios: 'doc.text.fill', android: 'description' }}>
          <Row
            icon={{ ios: 'doc.plaintext.fill', android: 'article' }}
            label="Kullanım koşulları"
            detail="Uygulamayı kullanırken geçerli kurallar"
            onPress={() => openLegalPage(TERMS_URL)}
            first
          />
          <Row
            icon={{ ios: 'lock.shield.fill', android: 'shield' }}
            label="Gizlilik politikası"
            detail="Hangi verini neden tutuyoruz, nasıl silinir"
            onPress={() => openLegalPage(PRIVACY_POLICY_URL)}
          />
          <Row
            icon={{ ios: 'building.columns.fill', android: 'account_balance' }}
            label="KVKK aydınlatma metni"
            detail="Kişisel verilerin ve hakların"
            onPress={() => openLegalPage(KVKK_URL)}
          />
        </Card>

        <Text style={[typeScale.caption, styles.center, { color: colors.textFaint }]}>{backup}</Text>

        {user ? (
          <View style={styles.bottom}>
            <Button label="Çıkış yap" variant="secondary" onPress={cikis} />
            <Pressable
              onPress={hesabiSil}
              disabled={deleting}
              accessibilityRole="button"
              style={({ pressed }) => [styles.deleteRow, { opacity: pressed || deleting ? 0.6 : 1 }]}
            >
              <Text style={[typeScale.bodyStrong, { color: colors.negative }]}>
                {deleting ? 'Hesap siliniyor…' : 'Hesabımı sil'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
      <StatusBarScrim />
    </>
  );
}

function Row({
  icon, label, detail, onPress, first = false,
}: { icon: IconName; label: string; detail: string; onPress: () => void; first?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, {
        borderTopWidth: first ? 0 : 1, borderTopColor: colors.border, opacity: pressed ? 0.7 : 1,
      }]}
    >
      <Icon name={icon} size={20} color={colors.accent} />
      <View style={styles.flex}>
        <Text style={[typeScale.bodyStrong, { color: colors.text }]}>{label}</Text>
        <Text style={[typeScale.caption, { color: colors.textFaint }]} numberOfLines={1}>{detail}</Text>
      </View>
      <Icon name={{ ios: 'chevron.right', android: 'chevron_right' }} size={14} color={colors.textFaint} />
    </Pressable>
  );
}

/**
 * Tema — üç küçük önizleme. Seçim CİHAZDA kalır (bkz. `device_prefs`):
 * telefon koyu, tablet açık olabilir.
 */
function ThemePicker() {
  const { colors, preference, setPreference } = useTheme();
  return (
    <View style={styles.themes}>
      {THEME_PREFERENCES.map((t) => {
        const selected = preference === t;
        return (
          <Pressable
            key={t}
            onPress={() => setPreference(t)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${THEME_LABELS[t]} tema`}
            style={[styles.themeCard, {
              borderColor: selected ? colors.accent : colors.border,
              borderWidth: selected ? 2 : 1,
            }]}
          >
            <ThemePreview kind={t} />
            <Text style={[typeScale.caption, {
              color: selected ? colors.accent : colors.textSoft, fontWeight: selected ? '700' : '400',
            }]}>
              {THEME_LABELS[t]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ThemePreview({ kind }: { kind: ThemePreference }) {
  const half = (scheme: 'light' | 'dark') => {
    const p = palette[scheme];
    return (
      <View style={[styles.previewHalf, { backgroundColor: p.background }]}>
        <View style={[styles.previewBar, { backgroundColor: p.accent }]} />
        <View style={[styles.previewLine, { backgroundColor: p.surface, borderColor: p.border }]} />
        <View style={[styles.previewLine, { backgroundColor: p.surface, borderColor: p.border }]} />
      </View>
    );
  };
  return (
    <View style={styles.preview}>
      {kind === 'dark' ? half('dark') : half('light')}
      {kind === 'system' ? half('dark') : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerSide: { width: 40, alignItems: 'flex-end' },
  iconButton: {
    width: 40, height: 40, borderRadius: radius.pill, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  identity: {
    borderWidth: 1, borderRadius: radius.lg, padding: space.xl,
    alignItems: 'center', gap: space.md,
  },
  identityText: { alignItems: 'center', gap: 2, maxWidth: '100%' },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  stretch: { alignSelf: 'stretch' },
  vehicleRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    minHeight: HIT_SIZE, paddingVertical: space.sm,
  },
  flex: { flex: 1, gap: 2 },
  active: {
    ...typeScale.label, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 3,
    overflow: 'hidden',
  },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    minHeight: HIT_SIZE, paddingVertical: space.sm,
  },
  subhead: { marginTop: space.sm },
  themes: { flexDirection: 'row', gap: space.sm },
  themeCard: { flex: 1, borderRadius: radius.md, padding: space.sm, alignItems: 'center', gap: space.xs },
  preview: {
    flexDirection: 'row', width: '100%', height: 64, borderRadius: radius.sm, overflow: 'hidden',
  },
  previewHalf: { flex: 1, padding: 6, gap: 4 },
  previewBar: { height: 12, borderRadius: 3 },
  previewLine: { height: 10, borderRadius: 3, borderWidth: StyleSheet.hairlineWidth },
  center: { textAlign: 'center' },
  bottom: { gap: space.sm },
  deleteRow: { minHeight: HIT_SIZE, alignItems: 'center', justifyContent: 'center' },
});
