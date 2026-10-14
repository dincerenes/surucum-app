import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { HIT_SIZE, space, type as typeScale, useTheme } from '@/theme/use-theme';

interface Props {
  /**
   * İsteğe bağlı. Ekranın kendi büyük başlığı zaten varsa BOŞ BIRAKILIR —
   * aynı kelimeyi iki kez yazmak, ekranı iki başlıkla açmak demek.
   */
  title?: string;
  /** Sağa yaslanan ikincil eylem — "Kaydet", "Sil". */
  action?: { label: string; onPress: () => void; danger?: boolean };
}

/**
 * Yığına itilen sayfaların başlığı.
 *
 * Yığında `headerShown: false` — her ekranın tasarımı kendi başlığını
 * çiziyor. Bunun bedeli şu: geri dönüş yolunu KOYMAYI UNUTAN ekran,
 * sürücüyü içeride kilitliyor. iOS'ta kenardan kaydırma jesti var ama
 * Android'de yok ve jest, görünür bir butonun yerini tutmuyor.
 *
 * Geri solda: yığın geçmişinde geriye gitmek soldan sağa okunan bir
 * hareket ve sürücü orayı arıyor. (Alttan açılan sayfalardaki "Kapat"
 * sağda; o bir geri değil, iptal.)
 */
export function PageHeader({ title, action }: Props) {
  const { colors } = useTheme();

  return (
    <View style={styles.head}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Geri"
        hitSlop={space.md}
        style={({ pressed }) => [styles.back, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={[typeScale.bodyStrong, { color: colors.accent }]}>‹ Geri</Text>
      </Pressable>

      {title ? (
        <Text
          style={[typeScale.bodyStrong, styles.title, { color: colors.text }]}
          numberOfLines={1}
        >
          {title}
        </Text>
      ) : (
        <View style={styles.title} />
      )}

      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          hitSlop={space.md}
          style={({ pressed }) => [styles.back, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text
            style={[
              typeScale.bodyStrong,
              { color: action.danger ? colors.negative : colors.accent },
            ]}
          >
            {action.label}
          </Text>
        </Pressable>
      ) : (
        // Başlığın ortada kalması için karşı tarafta eşit boşluk.
        <View style={styles.back} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    minHeight: HIT_SIZE - space.sm,
  },
  back: { minWidth: 64, paddingVertical: space.xs },
  title: { flex: 1, textAlign: 'center' },
});
