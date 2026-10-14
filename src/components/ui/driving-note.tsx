import { StyleSheet, Text } from 'react-native';

import { type as typeScale, useTheme } from '@/theme/use-theme';

/**
 * Araçta açılabilen kayıt ekranlarının altındaki tek satırlık sürüş
 * güvenliği notu (yolcu, yakıt, gider, vardiya başlatma/bitirme).
 *
 * Bilerek sakin: uyarı kutusu değil, silik tek satır. Sürücü günde kırk
 * kez bu ekranlara geliyor; renkli bir uyarı ilk günden sonra görünmez
 * oluyor, ama yazılı bir not da hiç olmamaktan iyi.
 */
export function DrivingNote() {
  const { colors } = useTheme();
  return (
    <Text style={[typeScale.caption, styles.note, { color: colors.textFaint }]}>
      Kayıtlarını araç güvenli biçimde dururken gir.
    </Text>
  );
}

const styles = StyleSheet.create({
  note: { textAlign: 'center' },
});
