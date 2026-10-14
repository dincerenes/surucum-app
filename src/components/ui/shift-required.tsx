import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from './button';
import { SheetHeader, sheetStyles } from './sheet';
import { space, type as typeScale, useTheme } from '@/theme/use-theme';

/**
 * Yolcu, gider ve yakıt YALNIZCA AÇIK VARDİYADA giriliyor.
 *
 * Her kayıt bir vardiyaya ait: Kayıtlar vardiya vardiya listeleniyor ve
 * her vardiya kartı kendi cebe kalanını gösteriyor. Ekran başka bir
 * yoldan (eski bir bağlantı, kapanmış vardiyadan kalmış bir sayfa)
 * açılırsa sessizce vardiyasız kayıt yazmıyor; nedenini söylüyor.
 */
export function ShiftRequired({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <View style={[sheetStyles.sheet, { backgroundColor: colors.background }]}>
      <SheetHeader title={title} />
      <View style={styles.body}>
        <Text style={[typeScale.heading, { color: colors.text }]}>Açık vardiya yok</Text>
        <Text style={[typeScale.body, { color: colors.textSoft }]}>
          Yolcu, gider ve yakıt vardiya açıkken giriliyor; her kayıt bir
          vardiyanın hesabına yazılıyor. Sürüş sekmesinden vardiyayı başlat.
        </Text>
        <Button label="Tamam" variant="secondary" onPress={() => router.back()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md, paddingTop: space.lg },
});
