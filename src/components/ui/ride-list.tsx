import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, FadeInDown, LayoutAnimationConfig,
} from 'react-native-reanimated';

import { AmountText } from './amount-text';
import { Icon } from './icon';
import type { ShiftCost } from '@/db/repo';
import type { Ride } from '@/db/schema/earnings';
import { formatClock } from '@/lib/business-date';
import { DURATION } from '@/lib/motion';
import { radius, space, type as typeScale, useTheme } from '@/theme/use-theme';

interface Props {
  rides: readonly Ride[];
  /**
   * Vardiyanın gider ve yakıt satırları — verilirse yolcularla AYNI
   * listede, saat sırasıyla.
   *
   * Canlı vardiyada açık: gider ve yakıt kaydediliyor ama vardiya
   * bitene kadar hiçbir yerde görünmüyordu; sürücü "kaydoldu mu"yu
   * yolcuda gördüğü gibi giderde de görmeli. Vardiya detayı giderleri
   * kendi bölümünde gösteriyor, ona verilmiyor.
   */
  costs?: readonly ShiftCost[];
  /** En fazla kaç satır. Aşan kısım "+N yolcu daha" olarak özetlenir. */
  limit?: number;
  /** Kayıt yokken gösterilecek metin. Boşsa hiçbir şey çizilmez. */
  emptyText?: string;
  /**
   * Yeni girilen yolcu en üste kayarak gelsin.
   *
   * Yalnızca canlı vardiyada açık: sürücü orada "kaydoldu mu" diye
   * bakıyor ve satırın gelişini görmek o soruyu cevaplıyor. Vardiya
   * detayında liste hazır geliyor; orada kayan satır sadece oyalar.
   */
  animated?: boolean;
}

/**
 * Yeni satırın gelişi — yukarıdan hafifçe inerek.
 *
 * Eski satırlar ANİMASYONSUZ aşağı iniyor. Önceden onlar da kayıyordu
 * (`LinearTransition`); telefonda bu kayma yarıda takıldı ve yeni satır
 * bir öncekinin üstüne bindi, iki saat ve iki tutar üst üste okundu
 * (7 Ekim 2026, ilk sürücü ekran görüntüsü). Okunmayan liste, akan
 * listeden kötü.
 */
const ROW_ENTER = FadeInDown.duration(DURATION.base).easing(Easing.out(Easing.cubic));

/**
 * Vardiya boyunca girilen seferler — saatiyle birlikte.
 *
 * NEDEN VAR: sefer eklemek tek dokunuşluk bir iş ve sonucu yalnızca
 * toplam rakamda görünüyordu. Sürücü "kaydoldu mu" diye emin olamıyor,
 * ekran da boş duruyordu. Girilen her kayıt anında burada beliriyor;
 * hem geri bildirim hem de yanlış girilen tutarı fark etme imkânı.
 *
 * En yeni üstte: sürücünün kontrol ettiği şey en son girdiği sefer.
 *
 * Satıra dokunmak düzenleme sayfasını açıyor: yanlış yazılan tutarı
 * fark eden sürücünün onu düzeltebileceği en yakın yer burası.
 */
export function RideList({ rides, costs, limit = 8, emptyText, animated = false }: Props) {
  /**
   * Ekran AÇILIRKEN var olan satırlar kaymıyor, yalnızca sonradan
   * eklenenler: sekmeye her dönüşte bütün listenin yeniden akması
   * "yeni bir şey oldu" sinyalini boşa harcar.
   *
   * Sarmalayıcı boş hâli de kapsıyor ki ilk yolcu da kayarak gelsin:
   * boş metinden listeye geçişte sarmalayıcı yerinde kalıyor, yalnızca
   * içi değişiyor.
   */
  if (!animated) {
    return <RideListBody rides={rides} costs={costs} limit={limit} emptyText={emptyText} />;
  }
  return (
    <LayoutAnimationConfig skipEntering>
      <RideListBody rides={rides} costs={costs} limit={limit} emptyText={emptyText} animated />
    </LayoutAnimationConfig>
  );
}

type Entry =
  | { kind: 'sefer'; id: string; at: number; ride: Ride }
  | { kind: 'gider' | 'yakit'; id: string; at: number; cost: ShiftCost };

function RideListBody({ rides, costs = [], limit = 8, emptyText, animated = false }: Props) {
  const { colors } = useTheme();

  if (rides.length === 0 && costs.length === 0) {
    if (!emptyText) return null;
    return (
      <Text style={[typeScale.caption, { color: colors.textFaint }]}>{emptyText}</Text>
    );
  }

  /**
   * En yeni üstte — çağıranın sırasına güvenilmiyor. Repo vardiyanın
   * yolcularını eskiden yeniye veriyor; olduğu gibi kesildiğinde sekizinci
   * yolcudan sonra girilen her kayıt "+N yolcu daha"nın içinde
   * kayboluyordu, sürücü tam baktığı satırı göremiyordu.
   */
  const entries: Entry[] = [
    ...rides.map((ride): Entry => ({ kind: 'sefer', id: ride.id, at: ride.occurredAt, ride })),
    ...costs.map((cost): Entry => ({ kind: cost.kind, id: cost.id, at: cost.at, cost })),
  ];
  const shown = entries.sort((a, b) => b.at - a.at).slice(0, limit);
  const rest = entries.length - shown.length;
  const mixed = costs.length > 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={[styles.label, { color: colors.textFaint }]}>
          {mixed ? 'KAYITLAR' : 'YOLCULAR'}
        </Text>
        <Text style={[typeScale.caption, { color: colors.textFaint }]}>
          {mixed ? `${rides.length} yolcu · ${costs.length} gider` : rides.length}
        </Text>
      </View>

      <View style={[styles.list, { borderColor: colors.border }]}>
        {shown.map((entry, index) => (
          <Row key={`${entry.kind}:${entry.id}`} animated={animated}>
            <Pressable
              onPress={() => router.push({
                pathname: '/kayit', params: { tur: entry.kind, id: entry.id },
              })}
              accessibilityRole="button"
              accessibilityLabel={entry.kind === 'sefer'
                ? 'Yolcu kaydını düzenle' : `${entry.cost.title} kaydını düzenle`}
              style={({ pressed }) => [
                styles.row,
                index > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                pressed && { backgroundColor: colors.surfaceSunken },
              ]}
            >
              <Text style={[styles.time, { color: colors.textFaint }]}>
                {formatClock(entry.at)}
              </Text>
              {entry.kind === 'sefer' ? (
                <>
                  <View style={styles.spacer} />
                  <AmountText value={entry.ride.grossAmountKurus} size="bodyStrong" />
                </>
              ) : (
                <>
                  <Icon
                    name={entry.kind === 'yakit'
                      ? { ios: 'fuelpump.fill', android: 'local_gas_station' }
                      : { ios: 'creditcard.fill', android: 'payments' }}
                    size={16}
                    color={colors.negative}
                  />
                  <Text
                    style={[typeScale.body, styles.costTitle, { color: colors.textSoft }]}
                    numberOfLines={1}
                  >
                    {entry.cost.title}
                  </Text>
                  <AmountText value={entry.cost.amount} size="bodyStrong" tone="cost" showMinus />
                </>
              )}
            </Pressable>
          </Row>
        ))}
      </View>

      {rest > 0 ? (
        <Text style={[typeScale.caption, { color: colors.textFaint }]}>
          +{rest} {mixed ? 'kayıt' : 'yolcu'} daha
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Satırın kabı. Hareketsiz listede düz bir parça: vardiya detayındaki
 * elli satırın her biri boşuna animasyonlu bir görünüm taşımasın.
 */
function Row({ animated, children }: { animated: boolean; children: ReactNode }) {
  if (!animated) return <>{children}</>;
  return (
    <Animated.View entering={ROW_ENTER}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  label: { ...typeScale.label, letterSpacing: 1 },
  list: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.sm,
  },
  time: { ...typeScale.body, fontVariant: ['tabular-nums'] },
  spacer: { flex: 1 },
  costTitle: { flex: 1 },
});
