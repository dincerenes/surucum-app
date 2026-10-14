import { Pressable, StyleSheet, Text, View } from 'react-native';

import { type AnnouncementSeverity } from '@/lib/announcements';
import { useAnnouncement } from '@/lib/use-announcement';
import { HIT_SIZE, radius, space, type as typeScale, useTheme } from '@/theme/use-theme';

/**
 * Anasayfanın üstündeki duyuru bandı.
 *
 * Kullanım koşulları ve gizlilik politikasındaki "önemli değişiklikleri
 * uygulama içinde duyururuz" vaadinin görünen yüzü. Duyuru yoksa, bulut
 * yoksa ya da oturum yoksa hiçbir şey çizmez. Sürücü "Kapat"a basınca
 * o duyuru bu cihazda bir daha çıkmaz.
 *
 * Renk önem derecesinden: bilgi vurgu, uyarı sarı, kritik kırmızı —
 * `Notice` ile aynı renk dili.
 */
export function AnnouncementBanner() {
  const { colors } = useTheme();
  const { announcement, dismiss } = useAnnouncement();
  if (!announcement) return null;

  const tone: Record<AnnouncementSeverity, { bg: string; fg: string }> = {
    info: { bg: colors.accentSoft, fg: colors.accent },
    warning: { bg: colors.warningSoft, fg: colors.warning },
    critical: { bg: colors.negativeSoft, fg: colors.negative },
  };
  const { bg, fg } = tone[announcement.severity];

  return (
    <View
      accessibilityRole="alert"
      style={[styles.wrap, { backgroundColor: bg, borderLeftColor: fg }]}
    >
      <View style={styles.text}>
        <Text style={[typeScale.bodyStrong, { color: fg }]}>{announcement.title}</Text>
        <Text style={[typeScale.body, { color: fg }]}>{announcement.body}</Text>
      </View>
      <Pressable
        onPress={dismiss}
        accessibilityRole="button"
        accessibilityLabel="Duyuruyu kapat"
        hitSlop={space.sm}
        style={({ pressed }) => [styles.close, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={[typeScale.bodyStrong, { color: fg }]}>Kapat</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'flex-start', gap: space.md,
    borderLeftWidth: 3, borderRadius: radius.sm,
    paddingVertical: space.md, paddingHorizontal: space.lg,
  },
  text: { flex: 1, gap: 2 },
  close: { minHeight: HIT_SIZE / 2, justifyContent: 'center' },
});
