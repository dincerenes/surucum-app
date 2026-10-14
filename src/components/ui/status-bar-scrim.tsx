import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/use-theme';

/**
 * Saat ve pil çubuğunun arkasındaki zemin.
 *
 * Uygulama ekranın en üstüne kadar uzanıyor ve o çubuk SAYDAM. Sayfa
 * aşağı kaydırılınca içerik saatin altından geçiyor, yazılar üst üste
 * biniyordu (2 Ekim 2026, mağaza görüntülerinde fark edildi). Kayan her
 * sayfa bunu kendi zemin rengiyle, kaydırılan alanın KARDEŞİ olarak koyar:
 *
 *   <>
 *     <ScrollView ... />
 *     <StatusBarScrim />
 *   </>
 *
 * Renk sayfanınkiyle aynı olmalı; yoksa kaydırılmamış sayfada üstte bir
 * şerit görünür.
 */
export function StatusBarScrim({ color }: { color?: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="none"
      style={[styles.scrim, { height: insets.top, backgroundColor: color ?? colors.background }]}
    />
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0 },
});
