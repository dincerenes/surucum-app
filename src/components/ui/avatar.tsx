import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from './icon';
import { type AvatarSymbol, initialOf, parseAvatar } from '@/lib/profile';
import { AVATAR_COLORS, useTheme } from '@/theme/use-theme';

interface Props {
  name: string | null | undefined;
  /** Saklanan avatar değeri (`app_settings.avatar`). Boşsa varsayılan. */
  avatar?: string | null;
  size?: number;
}

export const AVATAR_ICONS: Record<Exclude<AvatarSymbol, 'harf'>, IconName> = {
  car: { ios: 'car.fill', android: 'directions_car' },
  taxi: { ios: 'car.side.fill', android: 'local_taxi' },
  star: { ios: 'star.fill', android: 'star' },
  bolt: { ios: 'bolt.fill', android: 'bolt' },
  crown: { ios: 'crown.fill', android: 'workspace_premium' },
  flame: { ios: 'flame.fill', android: 'local_fire_department' },
  leaf: { ios: 'leaf.fill', android: 'eco' },
};

/**
 * Profil resmi — HAZIR AVATAR.
 *
 * Seçilmemişse adın baş harfi, vurgu renginin açık tonunda. Seçilmişse
 * sürücünün seçtiği sembol (ya da baş harf) doygun bir zeminde, beyaz.
 * Ad da yoksa kişi ikonu.
 */
export function Avatar({ name, avatar, size = 48 }: Props) {
  const { colors } = useTheme();
  const choice = parseAvatar(avatar);
  const initial = initialOf(name);

  const bg = choice.color == null ? colors.accentSoft : AVATAR_COLORS[choice.color];
  const fg = choice.color == null ? colors.accent : '#FFFFFF';

  return (
    <View style={[styles.circle, {
      width: size, height: size, borderRadius: size / 2, backgroundColor: bg,
    }]}>
      {choice.symbol !== 'harf' ? (
        <Icon name={AVATAR_ICONS[choice.symbol]} size={size * 0.5} color={fg} />
      ) : initial ? (
        <Text style={{ color: fg, fontSize: size * 0.42, fontWeight: '700' }}>{initial}</Text>
      ) : (
        <Icon name={{ ios: 'person.fill', android: 'person' }} size={size * 0.5} color={fg} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
