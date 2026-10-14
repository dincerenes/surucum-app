import { Image, StyleSheet, Text, View } from 'react-native';

import { brandLogo } from '@/lib/brand-logos';
import { upperTr } from '@/lib/text';
import { AVATAR_COLORS, useTheme } from '@/theme/use-theme';

interface Props {
  /** Aracın markası (CATALOG'daki ad, örn. "Renault"). */
  make: string | null | undefined;
  size?: number;
}

/**
 * Marka rozeti — gerçek logo varsa onu, yoksa (Togg gibi eksik markalarda
 * veya "Diğer"de) markanın baş harfini renkli bir zeminde gösterir.
 *
 * Logo zemini her zaman BEYAZ (iki temada da): logolar genelde koyu ya
 * da renkli çizilmiş, koyu temada kartın zemini üstüne binerse görünmez
 * olurdu. Harf rozetinin zemin rengi markanın adından türetiliyor —
 * aynı marka her yerde aynı renkte, listedeki sıraya bağlı değil.
 */
export function BrandBadge({ make, size = 40 }: Props) {
  const { colors } = useTheme();
  const logo = brandLogo(make);

  if (logo != null) {
    return (
      <View style={[styles.circle, {
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.border,
      }]}>
        <Image
          source={logo}
          resizeMode="contain"
          style={{ width: size * 0.65, height: size * 0.65 }}
        />
      </View>
    );
  }

  const initial = make ? upperTr(make.charAt(0)) : '';
  const bg = AVATAR_COLORS[hashIndex(make ?? '', AVATAR_COLORS.length)];

  return (
    <View style={[styles.circle, {
      width: size, height: size, borderRadius: size / 2, backgroundColor: bg,
    }]}>
      <Text style={{ color: '#FFFFFF', fontSize: size * 0.45, fontWeight: '700' }}>
        {initial}
      </Text>
    </View>
  );
}

/** Metinden kararlı bir dizin — aynı marka her zaman aynı rengi alsın. */
function hashIndex(text: string, mod: number): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % mod;
  }
  return Math.abs(hash) % mod;
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
