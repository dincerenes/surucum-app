import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue } from 'react-native';

type SymbolName = Extract<SymbolViewProps['name'], { ios?: unknown }>;

/** iOS'ta SF Symbols, Android'de Material Symbols adı. */
export type IconName = Required<Pick<SymbolName, 'ios' | 'android'>>;

interface Props {
  name: IconName;
  size?: number;
  color: ColorValue;
}

/**
 * Sistem ikonu — iOS'ta SF Symbols, Android'de Material Symbols.
 *
 * İkon PAKETİ eklenmedi: `expo-symbols` zaten uygulamada ve iki platformun
 * kendi ikon setini çiziyor; yazı tipi ya da görsel dosyası taşımıyor.
 * Sekme çubuğundaki basit ikonlar hâlâ saf View (`tab-icon.tsx`).
 */
export function Icon({ name, size = 22, color }: Props) {
  return <SymbolView name={name} size={size} tintColor={color} />;
}
