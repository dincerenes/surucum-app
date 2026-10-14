import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, Keyframe, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmountText, Button, DrivingNote, Icon, RideList } from '@/components/ui';
import { PaceRing } from '@/components/ui/pace-ring';
import { useDbValue } from '@/db/use-db';
import {
  getLastClosedShift, getPaceBaseline, getShiftSummary, listShiftCosts, listVehicleFuelTypes,
  startShift,
} from '@/db/repo';
import type { Shift } from '@/db/schema/earnings';
import { FUEL_TYPE_LABELS } from '@/db/schema/_shared';
import { formatBusinessDate, formatClock } from '@/lib/business-date';
import { haptic } from '@/lib/haptics';
import { ZERO, add, formatInteger, formatKurus } from '@/lib/money';
import { DURATION } from '@/lib/motion';
import { paceCaption, shiftPace } from '@/lib/pace';
import { earningsPerRide } from '@/lib/shift';
import { type DriverState, useDriver } from '@/lib/use-driver';
import { requestSync } from '@/sync/scheduler';
import { radius, space, type as typeScale, useTheme } from '@/theme/use-theme';

/**
 * Sürüş — açık vardiyanın tam ekran hâli.
 *
 * Sürücü gün boyu bu ekranda. Tek dev hedef var: "Yolcu ekle". Anasayfa
 * kaydırılabilir bir defter; burada kaydırma yok, başparmak nereye
 * gideceğini düşünmüyor.
 *
 * BURADAKİ HER SAYI AÇIK VARDİYANIN — günün değil. Bir iş gününde iki
 * vardiya olabilir; ekran "CANLI VARDİYA" diyorsa parası da o vardiyanın
 * olmalı. Karıştırıldığında sürücü yeni başlattığı boş vardiyada bir
 * öncekinin parasını görüyordu.
 *
 * Gösterilen sayı CİRO, cebe kalan değil. Komisyon ve yakıt vardiya
 * sonunda soruluyor; vardiya sürerken ikisi de bilinmiyor ve bilinmeyen
 * bir kesintiyi düşülmüş gibi göstermek sayıya olan güveni bitirir.
 * Günün üç satırı Anasayfa'da, gerçek rakamlarla duruyor.
 */
export default function DriveScreen() {
  const state = useDriver();
  const { openShift, userId, vehicle } = state;

  if (!openShift) return <ClosedState onStart={() => {
    if (!userId || !vehicle) return;
    // Ana eylem: sürücü yola bakarken "vardiya açıldı"yı elinde duysun.
    haptic.press();
    startShift(userId, vehicle.id);
    requestSync();
  }} />;

  /**
   * Vardiya başına ayrı bileşen: "normale ulaştın" titreşimi ve giriş
   * hareketi her vardiyada sıfırdan başlasın, bir öncekinden kalmasın.
   */
  return <LiveState key={openShift.id} state={state} shift={openShift} />;
}

/**
 * Canlı ekran açılırken hafifçe büyüyerek beliriyor: "Başlat"a basan
 * sürücü ekranın değiştiğini gözünün ucuyla görsün. Yarım saniyenin
 * altında ve yalnızca vardiya ekranı ilk kez çizilirken.
 */
const LIVE_ENTER = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.97 }] },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: Easing.out(Easing.cubic) },
}).duration(DURATION.base);

function LiveState({ state, shift }: { state: DriverState; shift: Shift }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { userId } = state;

  /**
   * Sürücünün normal vardiyasının cirosu — günlük hedef DEĞİL.
   *
   * Hedef cebe kalan üzerinden ölçülüyor ve vardiya sürerken cebe kalan
   * bilinmiyor; ciroyu ona bölmek sürücüye hedefini tutturduğunu
   * söyletirdi. Halka ciroyu ciroyla, sürücünün son 30 gündeki tipik
   * vardiyasıyla karşılaştırıyor (`src/lib/pace.ts`). Üç kapanmış
   * vardiyadan azı varsa halka yok, bekleme yazısı da yok.
   */
  const baseline = useDbValue(
    () => (userId ? getPaceBaseline(userId, shift.businessDate) : null),
    [userId, shift.businessDate],
  );

  /**
   * Vardiyanın gider ve yakıt kayıtları — yolcularla aynı listede.
   *
   * Toplamları ciroDAN DÜŞÜLMÜYOR, yanında ayrı kutuda: büyük sayı ciro
   * kalıyor. Yakıtın son hesabı vardiya sonunda tüketimden de yapılabilir
   * (o zaman dolum ayrıca düşülmez); buradaki rakam ödenen para.
   */
  const costs = useDbValue(
    () => (userId ? listShiftCosts(userId, shift.id) : []),
    [userId, shift.id],
  );
  const costTotal = costs.reduce((acc, c) => add(acc, c.amount), ZERO);

  const rides = state.shiftRides;
  const gross = state.shiftGross;
  /**
   * ₺/saat ve ₺/km YOK.
   *
   * ₺/saat vardiyanın başında saçmalıyor: on beş dakikada 2.250 ₺ girildiğinde
   * "9.000 ₺/saat" yazıyor. Sürücü o hızla çalışmayacağını biliyor; sayı
   * ona bir şey öğretmiyor, sadece uygulamanın ciddiyetini düşürüyor.
   * Anlamlı hâli vardiya kapandığında, tam süre belliyken hesaplanıyor.
   *
   * ₺/km ise kilometre vardiya sonunda sorulduğu için canlı ekranda
   * her zaman boş kalıyordu. ₺/sefer her seferde güncelleniyor ve
   * ilk seferden itibaren doğru.
   */
  const perRide = earningsPerRide(gross, rides.length);
  const pace = shiftPace(gross, baseline);
  useReachedHaptic(pace?.reached ?? null);

  /**
   * Komisyon ve yakıt notu büyük sayının DÜRÜSTLÜK DİPNOTU: gösterilen
   * ciro, cebe kalan değil. Halka varken onun yanında, yoksa tek başına —
   * ama her durumda büyük sayının hemen altında.
   */
  const disclaimer = (
    <Text style={[typeScale.caption, { color: colors.textFaint }]}>
      komisyon ve yakıt vardiya sonunda düşülür
    </Text>
  );

  return (
    <Animated.View
      entering={reduced ? undefined : LIVE_ENTER}
      style={[
        styles.live,
        { backgroundColor: colors.surfaceSunken, paddingTop: insets.top + space.xl },
      ]}
    >
      <View style={styles.liveHead}>
        <View style={[styles.dot, { backgroundColor: colors.positive }]} />
        <Text style={[styles.eyebrow, { color: colors.positive }]}>CANLI VARDİYA</Text>
        <View style={styles.spacer} />
        {/*
          Açılış saati başlık satırında: dipnotun altında ikinci satıra
          taşıyordu ve küçük telefonda o satır yolcu listesinden yer yiyordu.
        */}
        <Text style={[typeScale.caption, styles.digits, { color: colors.textFaint }]}>
          {`açılış ${formatClock(shift.startedAt)}`}
        </Text>
      </View>

      {/*
        Süre sayacı YOK: çalışılan saat vardiya bitince soruluyor. Ekranın
        büyük sayısı bu vardiyanın cirosu.
      */}
      <View style={styles.cash}>
        <Text style={[styles.eyebrow, { color: colors.textFaint }]}>BU VARDİYANIN CİROSU</Text>
        {/* Yolcu eklenince eski tutardan yenisine sayıyor: "eklendi" demenin gözle hâli. */}
        <AmountText value={gross} size="display" style={styles.bigCash} animate />
        {pace ? (
          <View style={styles.paceRow}>
            <PaceRing pace={pace} />
            <View style={styles.paceText}>
              <Text
                style={[typeScale.bodyStrong, styles.digits, {
                  color: pace.reached ? colors.positive : colors.text,
                }]}
                numberOfLines={1}
              >
                {paceCaption(pace)}
              </Text>
              {disclaimer}
            </View>
          </View>
        ) : disclaimer}
      </View>

      <View style={styles.stats}>
        <Stat value={formatInteger(rides.length)} label="yolcu" />
        <Stat
          value={perRide != null ? formatKurus(perRide, { symbol: false, decimals: false }) : '—'}
          label="₺/yolcu"
        />
        <Stat
          value={costs.length > 0
            ? `−${formatKurus(costTotal, { symbol: false, decimals: false })}` : '—'}
          label="gider"
          tone={costs.length > 0 ? 'cost' : undefined}
        />
      </View>

      <ScrollView
        style={styles.feed}
        contentContainerStyle={styles.feedBody}
        showsVerticalScrollIndicator={false}
      >
        <RideList
          rides={rides}
          costs={costs}
          emptyText="Henüz yolcu yok. İlk parayı aldığında aşağıdaki butona bas."
          animated
        />
      </ScrollView>

      <View style={styles.liveActions}>
        <Button label="Yolcu ekle" size="hero" plus onPress={() => router.push('/sefer')} />
        <View style={styles.pair}>
          <Button label="Gider" variant="secondary" style={styles.half}
            onPress={() => router.push('/gider')} />
          <Button label="Yakıt" variant="secondary" style={styles.half}
            onPress={() => router.push('/yakit')} />
        </View>
        <Button label="Vardiyayı bitir" variant="secondary"
          onPress={() => router.push('/vardiya-bitir')} />
      </View>
    </Animated.View>
  );
}

/**
 * Normal vardiyaya ulaşıldığı AN bir kez titreşir — ödül anı.
 *
 * Yalnızca bu oturumda altından üstüne geçişte: ekran açıldığında zaten
 * normalin üstündeyse titremez (o an bir şey olmadı), yanlış girilen
 * yolcu silinip yeniden eklenince ikinci kez de titremez. Ölçü yokken
 * (`null`) geçiş sayılmaz.
 */
function useReachedHaptic(reached: boolean | null) {
  const previous = useRef(reached);
  const fired = useRef(false);
  useEffect(() => {
    if (previous.current === false && reached === true && !fired.current) {
      fired.current = true;
      haptic.success();
    }
    previous.current = reached;
  }, [reached]);
}

function Stat({ value, label, tone }: { value: string; label: string; tone?: 'cost' }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: colors.surface }]}>
      <Text
        style={[typeScale.title, {
          color: tone === 'cost' ? colors.negative : colors.text, fontVariant: ['tabular-nums'],
        }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text style={[typeScale.caption, { color: colors.textFaint }]}>{label}</Text>
    </View>
  );
}

/** Başlat butonunun çapı — ekranın ortasında, başparmağın düşünmeden gittiği yer. */
const START_SIZE = 200;

/**
 * Vardiya kapalıyken: ortada BÜYÜK bir Başlat butonu.
 *
 * Eskiden bir başlık, bir paragraf ve ekran genişliğinde sıradan bir
 * butondu; sekme boş ve cansız görünüyordu. Sürücü bu ekrana tek bir iş
 * için geliyor: direksiyona geçti, vardiyayı açacak. Buton o işin kendisi
 * ve ekranın ortasında, yavaş bir nabızla duruyor.
 *
 * Üstte hangi araçla başlayacağı (vardiya o araca yazılıyor), altta son
 * vardiyanın özeti: ekran boş kalmıyor ve sürücü nerede kaldığını görüyor.
 *
 * Gider/yakıt girişi YOK: ikisi de yalnızca açık vardiyada giriliyor.
 */
function ClosedState({ onStart }: { onStart: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { userId, vehicle } = useDriver();

  const info = useDbValue(() => {
    if (!userId) return null;
    const last = getLastClosedShift(userId);
    const summary = last ? getShiftSummary(userId, last.id) : null;
    return {
      fuels: vehicle
        ? listVehicleFuelTypes(userId, vehicle.id)
          .map((f) => FUEL_TYPE_LABELS[f.fuelType]).join(' + ')
        : '',
      last: last && summary ? { shift: last, summary } : null,
    };
  }, [userId, vehicle?.id]);

  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1,
    );
  }, [pulse]);
  const ring = useAnimatedStyle(() => ({
    opacity: 0.35 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 0.22 }],
  }));

  const last = info?.last ?? null;

  return (
    <View style={[
      styles.closed,
      { backgroundColor: colors.background, paddingTop: insets.top + space.lg },
    ]}>
      <View style={styles.closedHead}>
        <Text style={[typeScale.display, { color: colors.text }]}>Sürüş</Text>
        {vehicle ? (
          <View style={[styles.vehicle, {
            backgroundColor: colors.surface, borderColor: colors.border,
          }]}>
            <Icon name={{ ios: 'car.fill', android: 'directions_car' }} size={18} color={colors.accent} />
            <Text style={[typeScale.bodyStrong, { color: colors.text }]} numberOfLines={1}>
              {vehicle.label}
            </Text>
            {info?.fuels ? (
              <Text style={[typeScale.caption, { color: colors.textFaint }]}>{info.fuels}</Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.center}>
        <View style={styles.startWrap}>
          <Animated.View
            pointerEvents="none"
            style={[styles.ring, { backgroundColor: colors.accent }, ring]}
          />
          <Pressable
            onPress={onStart}
            accessibilityRole="button"
            accessibilityLabel="Vardiyayı başlat"
            style={({ pressed }) => [styles.start, {
              backgroundColor: colors.accent,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            }]}
          >
            <Icon name={{ ios: 'play.fill', android: 'play_arrow' }} size={64} color={colors.accentText} />
            <Text style={[typeScale.heading, { color: colors.accentText }]}>Başlat</Text>
          </Pressable>
        </View>
        <Text style={[typeScale.body, styles.hint, { color: colors.textSoft }]}>
          Direksiyona geçtiğinde bas. Vardiya açılınca yolcu eklemek tek dokunuş.
        </Text>
        <DrivingNote />
      </View>

      {last ? (
        <Pressable
          onPress={() => router.push({ pathname: '/vardiya', params: { id: last.shift.id } })}
          accessibilityRole="button"
          accessibilityLabel="Son vardiyanın detayı"
          style={({ pressed }) => [styles.last, {
            backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
            borderColor: colors.border,
          }]}
        >
          <View style={styles.lastText}>
            <Text style={[typeScale.label, { color: colors.textFaint }]}>SON VARDİYA</Text>
            <Text style={[typeScale.body, { color: colors.text }]}>
              {formatBusinessDate(last.shift.businessDate, 'dayMonth')}
              {' · '}
              {formatClock(last.shift.startedAt)}–{formatClock(last.shift.endedAt ?? last.shift.startedAt)}
            </Text>
            <Text style={[typeScale.caption, { color: colors.textFaint }]}>
              {formatInteger(last.summary.rideCount)} yolcu
              {last.summary.distanceKm != null
                ? ` · ${formatInteger(last.summary.distanceKm)} km` : ''}
            </Text>
          </View>
          <View style={styles.lastAmount}>
            <AmountText value={last.summary.profit.cashProfit} size="heading" tone="signed" />
            <Text style={[typeScale.caption, { color: colors.textFaint }]}>cebe kalan</Text>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  live: { flex: 1, paddingHorizontal: space.xl, gap: space.xs },
  liveHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  spacer: { flex: 1 },
  digits: { fontVariant: ['tabular-nums'] },
  dot: { width: 8, height: 8, borderRadius: 4 },
  eyebrow: { ...typeScale.label, letterSpacing: 1 },
  /**
   * Dikey boşluklar `md`: halka satırı eklenince iPhone SE'de (667pt)
   * "Yolcu ekle" kaydırmadan görünür kalsın, yolcu listesine de en az
   * bir satır yer kalsın diye.
   */
  cash: { marginTop: space.md, gap: space.xs },
  bigCash: { fontSize: 56, lineHeight: 64, letterSpacing: -1.5 },
  paceRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  paceText: { flex: 1, gap: 2 },
  stats: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  feed: { flex: 1, marginTop: space.md },
  feedBody: { paddingBottom: space.lg },
  stat: { flex: 1, borderRadius: radius.md, padding: space.md, gap: 2 },
  liveActions: { paddingBottom: space.xl, gap: space.md },
  pair: { flexDirection: 'row', gap: space.md },
  half: { flex: 1 },
  closed: { flex: 1, paddingHorizontal: space.xl, paddingBottom: space.xl, gap: space.lg },
  closedHead: { gap: space.md, alignItems: 'flex-start' },
  vehicle: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm, maxWidth: '100%',
    borderWidth: 1, borderRadius: radius.pill,
    paddingHorizontal: space.md, paddingVertical: space.sm,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xl },
  startWrap: {
    width: START_SIZE, height: START_SIZE, alignItems: 'center', justifyContent: 'center',
  },
  ring: {
    position: 'absolute', width: START_SIZE, height: START_SIZE, borderRadius: START_SIZE / 2,
  },
  start: {
    width: START_SIZE, height: START_SIZE, borderRadius: START_SIZE / 2,
    alignItems: 'center', justifyContent: 'center', gap: space.xs,
  },
  hint: { textAlign: 'center', maxWidth: 280 },
  last: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    borderWidth: 1, borderRadius: radius.lg, padding: space.lg,
  },
  lastText: { flex: 1, gap: 2 },
  lastAmount: { alignItems: 'flex-end', gap: 2 },
});
