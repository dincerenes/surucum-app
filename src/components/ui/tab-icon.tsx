import { View, type ColorValue, type ViewStyle } from 'react-native';

/**
 * Sekme ikonları — kütüphane yok, saf View.
 *
 * İkon paketi eklemek uygulamaya birkaç yüz kilobayt ve bir yazı tipi
 * bağımlılığı getiriyor; beş sekme için gereksiz. Bunlar aynı zamanda
 * `currentColor` gibi davranıyor: rengi çağıran veriyor, tema kendiliğinden
 * çalışıyor.
 */

/**
 * Sekme çubuğu `ColorValue` veriyor (platforma özel renk nesnesi olabilir),
 * düz metin değil. Doğrudan `string` beklemek tip hatası veriyordu.
 */
interface Props { color: ColorValue; focused?: boolean }

const BOX: ViewStyle = { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' };

export function HomeIcon({ color, focused }: Props) {
  return (
    <View style={BOX}>
      <View style={{
        width: 18, height: 18, borderRadius: 5,
        borderWidth: focused ? 2.5 : 2, borderColor: color,
      }} />
    </View>
  );
}

export function ListIcon({ color, focused }: Props) {
  const h = focused ? 2.5 : 2;
  return (
    <View style={[BOX, { gap: 4 }]}>
      {[20, 20, 14].map((w, i) => (
        <View key={i} style={{ width: w, height: h, borderRadius: 2, backgroundColor: color }} />
      ))}
    </View>
  );
}

export function DriveIcon({ color }: Props) {
  return (
    <View style={BOX}>
      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: color }} />
    </View>
  );
}

export function ChartIcon({ color, focused }: Props) {
  const w = focused ? 5 : 4;
  return (
    <View style={[BOX, { flexDirection: 'row', alignItems: 'flex-end', gap: 3 }]}>
      {[9, 16, 12].map((h, i) => (
        <View key={i} style={{ width: w, height: h, borderRadius: 1.5, backgroundColor: color }} />
      ))}
    </View>
  );
}

export function PersonIcon({ color, focused }: Props) {
  const b = focused ? 2.5 : 2;
  return (
    <View style={[BOX, { gap: 2 }]}>
      <View style={{ width: 9, height: 9, borderRadius: 5, borderWidth: b, borderColor: color }} />
      <View style={{
        width: 17, height: 9, borderTopLeftRadius: 9, borderTopRightRadius: 9,
        borderWidth: b, borderBottomWidth: 0, borderColor: color,
      }} />
    </View>
  );
}
