import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnnouncementBanner } from '@/components/announcement-banner';
import {
  AmountText, Avatar, Button, Card, GoalBar, Icon, type IconName, ScoreRing, StatGrid, StatTile,
  useScoreColor, StatusBarScrim,
} from '@/components/ui';
import {
  type HomeScore, getHomeOverview, getHomeScore, getSettings,
} from '@/db/repo';
import { useDbValue } from '@/db/use-db';
import {
  type BusinessDate, formatBusinessDate, formatClock, monthName, toBusinessDate, weekdayIndex,
} from '@/lib/business-date';
import { SCORE_BAND_LABELS, scoreBand } from '@/lib/efficiency';
import { type DailyBar, barRatio } from '@/lib/home';
import { type Kurus, ZERO, formatInteger, formatKurus, sum } from '@/lib/money';
import { DURATION, STAGGER } from '@/lib/motion';
import { type DayPhase, dayPhase, firstName, greetingFor } from '@/lib/profile';
import { type HomeHint, getDemandModel, homeHint, resolvePusulaCity } from '@/lib/pusula';
import { earningsPerRide, formatDuration, isShiftStale } from '@/lib/shift';
import { upperTr } from '@/lib/text';
import { useBusinessToday } from '@/lib/use-business-today';
import { useDriver } from '@/lib/use-driver';
import { useNow } from '@/lib/use-now';
import { type Colors } from '@/theme/tokens';
import { HIT_SIZE, radius, space, type as typeScale, useTheme } from '@/theme/use-theme';

/**
 * Anasayfa — kartlar.
 *
 * Eskiden "gün defteri"ydi: tek günün döküm satırları ve yolcu listesi.
 * Sürücü uygulamayı açınca üç şey soruyor: bugün ne yaptım, bu ay nasıl
 * gidiyor, son günler nasıldı. Her kart bunlardan birinin cevabı; günün
 * satır satır dökümü vardiya detayında.
 *
 * Kart sırası önem sırası: unutulmuş vardiya uyarısı (varsa) en üstte,
 * çünkü o düzelmeden altındaki sayıların hepsi yanlış.
 *
 * Kartlar ilk açılışta yukarıdan aşağı SIRAYLA beliriyor ve büyük
 * sayılar sıfırdan sayıyor: göz önem sırasını hareketin sırasından da
 * okuyor. Sekme açık kaldıkça tekrar oynamıyor — her dönüşte aynı
 * gösteriyi izlemek ikinci seferde sabır sınavı.
 */
export default function HomeScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const state = useDriver();
  const { userId, openShift } = state;
  const now = useNow();
  /**
   * Gün dönünce kartlar yeni güne geçsin — kayıt yazılmasını beklemeden
   * (bkz. `useBusinessToday`).
   */
  const today = useBusinessToday(userId);

  const data = useDbValue(() => {
    if (!userId) return null;
    const at = Date.now();
    const settings = getSettings(userId);
    return {
      today,
      name: settings?.displayName ?? null,
      avatar: settings?.avatar ?? null,
      city: settings?.city ?? null,
      overview: getHomeOverview(userId, today, at),
      score: getHomeScore(userId, today, at),
    };
  }, [userId, today]);

  const hour = new Date(now).getHours();
  const name = firstName(data?.name);
  const stale = openShift ? isShiftStale(openShift, now) : false;

  /**
   * Pusula ipucu YALNIZCA sürücünün kendi şehri destekleniyorsa. Pusula
   * sekmesi desteklenmeyen şehirde İstanbul'u gösteriyor ama orada
   * "İstanbul" yazıyor; Anasayfa'daki tek satırda Ankaralı sürücüye
   * Kadıköy demek yanlış bilgi olur.
   */
  const city = resolvePusulaCity(data?.city);
  const hint = city.kind === 'supported' ? homeHint(getDemandModel(city.city), new Date(now)) : null;

  // Sırayla beliren kartların sırası; uyarı kartı yoksa boşluk kalmasın.
  let order = 0;
  const enter = () => FadeInDown.duration(DURATION.base).delay(order++ * STAGGER)
    .easing(Easing.out(Easing.cubic));

  return (
    <>
      <ScrollView
        contentContainerStyle={[styles.page, { paddingTop: insets.top + space.lg }]}
        showsVerticalScrollIndicator={false}
      >
        <AnnouncementBanner />

        <View style={styles.head}>
          <View style={styles.headText}>
            {data ? (
              <View style={styles.dateRow}>
                <PhaseBadge phase={dayPhase(hour)} />
                <Text style={[styles.date, { color: colors.textFaint }]}>
                  {upperTr(formatBusinessDate(data.today, 'long'))}
                </Text>
              </View>
            ) : null}
            <Text style={[typeScale.display, { color: colors.text }]} numberOfLines={2}>
              {greetingFor(hour)}{name ? `, ${name}` : ''}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/profil')}
            accessibilityRole="button"
            accessibilityLabel="Profil"
            hitSlop={space.sm}
          >
            <Avatar name={data?.name} avatar={data?.avatar} size={52} />
          </Pressable>
        </View>

        {hint ? (
          <Animated.View entering={enter()}><PusulaHint hint={hint} /></Animated.View>
        ) : null}

        {openShift && stale ? (
          <Animated.View entering={enter()}>
            <StaleShiftCard startedAt={openShift.startedAt} />
          </Animated.View>
        ) : null}

        <Animated.View entering={enter()}><TodayCard /></Animated.View>

        {data ? (
          <>
            <Animated.View entering={enter()}>
              <ScoreCard score={data.score} today={data.today} />
            </Animated.View>
            <Animated.View entering={enter()}>
              <MonthCard overview={data.overview} month={Number(data.today.slice(5, 7))} />
            </Animated.View>
            {data.overview.best ? (
              <Animated.View entering={enter()}><BestDayCard overview={data.overview} /></Animated.View>
            ) : null}
            <Animated.View entering={enter()}><WeekCard bars={data.overview.week} /></Animated.View>
          </>
        ) : null}
      </ScrollView>
      <StatusBarScrim />
    </>
  );
}

const PHASE_ICONS: Record<DayPhase, IconName> = {
  sabah: { ios: 'sunrise.fill', android: 'wb_twilight' },
  gunduz: { ios: 'sun.max.fill', android: 'light_mode' },
  aksam: { ios: 'sunset.fill', android: 'wb_twilight' },
  gece: { ios: 'moon.stars.fill', android: 'bedtime' },
};

/**
 * Tarihin solunda günün evresi — güneş, gün batımı, ay.
 *
 * Gece vardiyası çalışan sürücü için uygulamanın saati "bildiğini"
 * gösteren küçük bir işaret. Renk anlamsal renklerden değil: güneş
 * turuncu-uyarı tonunda, ay vurgu renginde; kazanç/gider anlamı taşımıyor.
 */
function PhaseBadge({ phase }: { phase: DayPhase }) {
  const { colors } = useTheme();
  const night = phase === 'gece';
  return (
    <View style={[styles.phase, { backgroundColor: night ? colors.accentSoft : colors.warningSoft }]}>
      <Icon name={PHASE_ICONS[phase]} size={13} color={night ? colors.accent : colors.warning} />
    </View>
  );
}

/**
 * Pusula'dan tek satır: şu an ne kadar yoğun, nerede. Hep "tahmini"
 * etiketiyle (Pusula'daki her şey tahmin).
 *
 * Pusula İstatistik'in ikinci sekmesinde duruyor ve sürücü oraya
 * kendiliğinden gitmiyor; en sık açılan ekranda tek satır, "şimdi
 * çıksam mı" sorusunu uygulamayı açar açmaz cevaplıyor. Dokununca
 * Pusula'nın tamamı.
 */
function PusulaHint({ hint }: { hint: HomeHint }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/istatistik', params: { bolum: 'pusula' } })}
      accessibilityRole="button"
      accessibilityLabel={`Pusula, tahmini: şu an ${hint.label}, ${hint.detail}. Pusula'yı aç`}
      style={({ pressed }) => [styles.hint, {
        backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1,
      }]}
    >
      <LevelBars level={hint.level} colors={colors} />
      <Text style={[typeScale.bodyStrong, { color: colors.text }]}>{hint.label}</Text>
      {/* Veri sürücü kayıtlarından değil, şehrin genel düzeninden: kesinlik gibi görünmesin. */}
      <Text style={[typeScale.caption, { color: colors.textFaint }]}>tahmini</Text>
      <Text style={[typeScale.body, styles.hintDetail, { color: colors.textSoft }]} numberOfLines={1}>
        {hint.detail}
      </Text>
      <Icon name={{ ios: 'chevron.right', android: 'chevron_right' }} size={13} color={colors.textFaint} />
    </Pressable>
  );
}

/** Sinyal çubuğu gibi dört kademe — yoğunluk ŞİDDETİ, vurgu tonlarıyla. */
function LevelBars({ level, colors }: { level: number; colors: Colors }) {
  return (
    <View style={styles.levels}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={[styles.levelBar, {
          height: 6 + i * 3,
          backgroundColor: i <= level ? colors.accentScale[1 + i] : colors.surfaceSunken,
        }]} />
      ))}
    </View>
  );
}

/**
 * Açık unutulmuş vardiya — kartların üstünde, sarı.
 *
 * Kapanmayan vardiyanın yolcuları hiçbir kapanmış günün hesabına girmiyor.
 * Yalnızca uyarmak yetmez: düğme bitirme sihirbazını açıyor.
 */
function StaleShiftCard({ startedAt }: { startedAt: number }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.stale, { backgroundColor: colors.warningSoft }]}>
      <Text style={[typeScale.heading, { color: colors.warning }]}>
        Vardiyan uzun süredir açık
      </Text>
      <Text style={[typeScale.body, { color: colors.warning }]}>
        {`Açılış: ${formatBusinessDate(toBusinessDate(startedAt), 'weekday')} ${
          formatClock(startedAt)}. Bitirmeyi unuttuysan şimdi kapat.`}
      </Text>
      <Button label="Vardiyayı bitir" variant="secondary"
        onPress={() => router.push('/vardiya-bitir')} />
    </View>
  );
}

/**
 * "Günlük kazancın" — YALNIZCA BİLGİ, renkli vurgu kartı.
 *
 * Kayıt girişi burada YOK (sürücünün kararı): yolcu, gider ve yakıt
 * Sürüş sekmesinden giriliyor. Anasayfa bakılan yer; iki ekranda aynı
 * düğmeler olunca hangisinin "asıl" yer olduğu bulanıklaşıyordu. Karta
 * dokunmak Sürüş'ü açıyor.
 *
 * Vardiya AÇIKKEN canlı: bu vardiyanın cirosu ve yolcusu. Büyük
 * sayı CİRO — komisyon ve yakıt vardiya biterken soruluyor, bilinmeyen
 * kesintiyi düşülmüş gibi göstermek sayıya güveni bitirir.
 * Vardiya KAPALIYKEN bugünün cebe kalanı.
 */
function TodayCard() {
  const { colors } = useTheme();
  const { openShift, shiftRides, shiftGross, goal, summary } = useDriver();
  const on = colors.accentText;

  const worked = summary?.hasActivity ?? false;
  // Süre YOK: çalışılan saat vardiya bitince soruluyor, açıkken sayaç işlemiyor.
  const perRide = earningsPerRide(shiftGross, shiftRides.length);
  const facts: { value: string; label: string }[] = openShift
    ? [
      { value: formatInteger(shiftRides.length), label: 'yolcu' },
      {
        value: perRide == null ? '—' : formatKurus(perRide, { decimals: false }),
        label: 'yolcu başı',
      },
    ]
    : worked && summary
      ? [
        { value: formatInteger(summary.rideCount), label: 'yolcu' },
        { value: formatKurus(summary.profit.revenue, { decimals: false }), label: 'ciro' },
      ]
      : [];

  return (
    <Pressable
      onPress={() => router.push('/surus')}
      accessibilityRole="button"
      accessibilityLabel="Günlük kazancın, Sürüş'ü aç"
      style={({ pressed }) => [styles.hero, {
        backgroundColor: colors.accent, opacity: pressed ? 0.92 : 1,
      }]}
    >
      <View style={styles.heroHead}>
        <Text style={[styles.heroLabel, { color: on }]}>GÜNLÜK KAZANCIN</Text>
        {openShift ? (
          <View style={[styles.livePill, { backgroundColor: colors.positive }]}>
            <View style={[styles.liveDot, { backgroundColor: colors.surface }]} />
            <Text style={[typeScale.label, { color: colors.surface }]}>VARDİYA AÇIK</Text>
          </View>
        ) : (
          <Text style={[typeScale.caption, { color: on, opacity: 0.8 }]}>bugün</Text>
        )}
      </View>

      {openShift || worked ? (
        <View style={styles.bigRow}>
          <AmountText
            value={openShift ? shiftGross : summary!.profit.cashProfit}
            size="display"
            animate="mount"
            style={{ color: on, fontSize: 38, lineHeight: 44 }}
          />
          <Text style={[typeScale.caption, { color: on, opacity: 0.8 }]}>
            {openShift ? 'ciro' : 'cebe kalan'}
          </Text>
        </View>
      ) : (
        <Text style={[typeScale.body, { color: on }]}>
          Bugün henüz vardiya yok. Sürüş sekmesinden başlattığında kazancın
          burada canlı görünecek.
        </Text>
      )}

      {facts.length > 0 ? (
        <View style={styles.heroFacts}>
          {facts.map((f) => (
            <View key={f.label} style={[styles.heroFact, { backgroundColor: 'rgba(255,255,255,0.16)' }]}>
              <Text style={[typeScale.title, { color: on }]} numberOfLines={1} adjustsFontSizeToFit>
                {f.value}
              </Text>
              <Text style={[typeScale.caption, { color: on, opacity: 0.85 }]}>{f.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {goal ? (
        <View style={[styles.goalWrap, { backgroundColor: colors.surface }]}>
          <GoalBar goal={goal} />
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * "Verimlilik puanı" — SON PUANLANMIŞ günün halkası.
 *
 * Puan sürücünün kendi normal gününe göre (`src/lib/efficiency.ts`).
 * Açık vardiyalı gün puanlanmıyor — süre vardiya bitince soruluyor —
 * o yüzden halka bugünü değil son kapanmış günü gösterebilir; tarih
 * her zaman yazıyor. Hiç puan yokken sıfırla duruyor. Dokununca
 * İstatistik'teki analiz.
 */
function ScoreCard({ score, today }: { score: HomeScore; today: BusinessDate }) {
  const { colors } = useTheme();
  const colorFor = useScoreColor();
  const latest = score.latest;

  const when = latest == null
    ? null
    : latest.date === today ? 'bugün' : formatBusinessDate(latest.date, 'weekday');

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/istatistik', params: { bolum: 'kazancim' } })}
      accessibilityRole="button"
      accessibilityLabel="Verimlilik puanı, İstatistik'i aç"
    >
      <Card title="Verimlilik puanı" meta={when ?? undefined}
        icon={{ ios: 'gauge.with.dots.needle.67percent', android: 'speed' }}>
        <View style={styles.scoreRow}>
          <ScoreRing score={latest?.score ?? 0} size={76} />
          <View style={styles.scoreText}>
            {/* Puan yokken de sıfırla duruyor; bekleme yazısı yok (sürücünün kararı). */}
            <Text style={[typeScale.heading, {
              color: latest ? colorFor(latest.score) : colors.textFaint,
            }]}>
              {latest ? SCORE_BAND_LABELS[scoreBand(latest.score)] : 'Henüz puanlanan gün yok'}
            </Text>
            <Text style={[typeScale.body, { color: colors.textSoft }]}>
              {`${formatKurus(latest?.perHour ?? 0, { decimals: false })} / saat cebe kalan`}
            </Text>
            <Text style={[typeScale.caption, { color: colors.textFaint }]}>
              {`Normalin ${formatKurus(latest?.baseline.perHour ?? 0, { decimals: false })} / saat`
                + ` · 30 gün ortalaman ${score.average ?? 0}`}
            </Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

/**
 * "Aylık ortalama" — bu ay ÇALIŞILAN gün başına.
 *
 * Büyük sayı gün başına cebe kalan. Km ortalaması yalnızca km'si girilmiş
 * günlerden; hiç yoksa "—". Bilinmeyen tahmin edilmez.
 */
function MonthCard({ overview, month }: {
  overview: ReturnType<typeof getHomeOverview>; month: number;
}) {
  const { colors } = useTheme();
  const a = overview.averages;

  return (
    <Card title="Aylık ortalama" meta={monthName(month)} icon={{ ios: 'calendar', android: 'calendar_month' }}>
      {a.perDay == null ? (
        <Text style={[typeScale.body, { color: colors.textSoft }]}>
          Bu ay henüz çalışılan gün yok. İlk vardiyadan sonra gün başına ne
          kaldığını burada göreceksin.
        </Text>
      ) : (
        <>
          <View style={styles.bigRow}>
            <AmountText value={a.perDay} size="display" tone="signed" animate="mount" />
            <Text style={[typeScale.caption, { color: colors.textFaint }]}>/ gün cebe kalan</Text>
          </View>
          <Text style={[typeScale.caption, { color: colors.textFaint }]}>
            {formatInteger(a.workedDayCount)} çalışılan günün ortalaması
          </Text>
          <StatGrid>
            <StatTile value={a.ridesPerDay == null ? '—' : oneDecimal(a.ridesPerDay)} label="yolcu / gün" />
            <StatTile value={a.kmPerDay == null ? '—' : `${formatInteger(a.kmPerDay)} km`} label="km / gün" />
            <StatTile
              value={a.minutesPerDay == null ? '—' : formatDuration(a.minutesPerDay)}
              label="süre / gün"
            />
            <StatTile
              value={a.revenuePerDay == null ? '—' : formatKurus(a.revenuePerDay, { decimals: false })}
              label="ciro / gün"
            />
          </StatGrid>
        </>
      )}
    </Card>
  );
}

/**
 * "Bu ayın en iyi günü" — sürücünün kendi rekoru.
 *
 * Ortalama "genelde" ne olduğunu söylüyor; en iyi gün neyin MÜMKÜN
 * olduğunu. O günün yolcusu ve süresi yanında: rekorun nasıl geldiği
 * (çok yolcu mu, uzun gün mü) bir bakışta okunuyor. Dokununca Kayıtlar.
 */
function BestDayCard({ overview }: { overview: ReturnType<typeof getHomeOverview> }) {
  const { colors } = useTheme();
  const best = overview.best;
  if (!best) return null;
  const s = best.summary;

  return (
    <Pressable
      onPress={() => router.push('/kayitlar')}
      accessibilityRole="button"
      accessibilityLabel="Bu ayın en iyi günü, Kayıtlar'ı aç"
    >
      <Card
        title="Bu ayın en iyi günü"
        icon={{ ios: 'trophy.fill', android: 'emoji_events' }}
        meta={formatBusinessDate(best.date, 'weekday')}
      >
        <View style={styles.bigRow}>
          <AmountText value={s.profit.cashProfit} size="title" tone="signed" />
          <Text style={[typeScale.caption, { color: colors.textFaint }]}>cebe kalan</Text>
        </View>
        <Text style={[typeScale.body, { color: colors.textSoft }]}>
          {[
            `${formatInteger(s.rideCount)} yolcu`,
            s.durationMinutes > 0 ? formatDuration(s.durationMinutes) : null,
            `ciro ${formatKurus(s.profit.revenue, { decimals: false })}`,
          ].filter(Boolean).join(' · ')}
        </Text>
      </Card>
    </Pressable>
  );
}

const WEEKDAY_SHORT = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];
const BAR_HEIGHT = 88;

/**
 * "Son 7 gün" — günlük cebe kalan, mini çubuk grafik.
 *
 * Boş gün boş çubuk: çalışılmayan gün grafikten atılırsa hafta olduğundan
 * dolu görünür. Zarar edilen gün kırmızı bir çizgi. Dokununca İstatistik.
 */
function WeekCard({ bars }: { bars: DailyBar[] }) {
  const { colors } = useTheme();
  const total = sum(bars.map((b) => b.cashProfit ?? ZERO)) as Kurus;
  const any = bars.some((b) => b.cashProfit != null);

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/istatistik', params: { bolum: 'kazancim' } })}
      accessibilityRole="button"
      accessibilityLabel="Son 7 gün, İstatistik'i aç"
    >
      <Card
        title="Son 7 gün"
        meta={any ? formatKurus(total, { decimals: false }) : undefined}
        icon={{ ios: 'chart.bar.fill', android: 'bar_chart' }}
      >
        <View style={styles.chart}>
          {bars.map((b, i) => {
            const ratio = barRatio(b.cashProfit, bars);
            const loss = b.cashProfit != null && b.cashProfit < 0;
            return (
              <View key={b.date} style={styles.barCol}>
                <View style={[styles.barTrack, { backgroundColor: colors.surfaceSunken }]}>
                  <GrowingBar
                    index={i}
                    height={loss ? 3 : Math.max(ratio * BAR_HEIGHT, b.cashProfit != null ? 3 : 0)}
                    color={loss
                      ? colors.negative
                      : b.isToday ? colors.accent : colors.accentScale[2]}
                  />
                </View>
                <Text style={[typeScale.caption, {
                  color: b.isToday ? colors.text : colors.textFaint,
                  fontWeight: b.isToday ? '700' : '400',
                }]}>
                  {WEEKDAY_SHORT[weekdayIndex(b.date)]}
                </Text>
              </View>
            );
          })}
        </View>
        {!any ? (
          <Text style={[typeScale.caption, { color: colors.textFaint }]}>
            Son 7 günde kayıt yok.
          </Text>
        ) : null}
      </Card>
    </Pressable>
  );
}

/**
 * Alttan büyüyen çubuk. Günler soldan sağa sırayla yükseliyor: hafta
 * okunma yönünde akıyor. Yükseklik değişince (yeni kayıt) eski
 * boyundan yenisine kayıyor, sıfırdan yeniden büyümüyor.
 */
function GrowingBar({ index, height, color }: { index: number; height: number; color: string }) {
  const h = useSharedValue(0);
  const first = useSharedValue(true);
  useEffect(() => {
    const delay = first.get() ? 200 + index * 40 : 0;
    first.set(false);
    h.set(withDelay(delay, withTiming(height, {
      duration: DURATION.base, easing: Easing.out(Easing.cubic),
    })));
  }, [height, index, h, first]);
  const style = useAnimatedStyle(() => ({ height: h.get() }));
  return <Animated.View style={[styles.bar, { backgroundColor: color }, style]} />;
}

/** 12,5 — tam sayıysa virgülsüz. */
function oneDecimal(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded)
    ? formatInteger(rounded)
    : `${formatInteger(Math.trunc(rounded))},${Math.round(Math.abs(rounded % 1) * 10)}`;
}

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: space.xl,
    paddingBottom: space.xxxl,
    gap: space.lg,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headText: { flex: 1, gap: space.xs },
  date: { ...typeScale.label, letterSpacing: 1 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  phase: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  hint: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    minHeight: HIT_SIZE, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.lg,
  },
  hintDetail: { flex: 1 },
  levels: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  levelBar: { width: 4, borderRadius: 1 },
  stale: { borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  bigRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, flexWrap: 'wrap' },
  hero: { borderRadius: radius.lg, padding: space.xl, gap: space.md },
  heroHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroLabel: { ...typeScale.label, letterSpacing: 1, opacity: 0.9 },
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 4,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  heroFacts: { flexDirection: 'row', gap: space.sm },
  heroFact: { flex: 1, borderRadius: radius.md, padding: space.md, gap: 2 },
  goalWrap: { borderRadius: radius.md, padding: space.md },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  scoreText: { flex: 1, gap: 2 },
  chart: {
    flexDirection: 'row', justifyContent: 'space-between', gap: space.xs,
    minHeight: HIT_SIZE,
  },
  barCol: { flex: 1, alignItems: 'center', gap: space.xs },
  barTrack: {
    width: '70%', height: BAR_HEIGHT, borderRadius: radius.sm,
    justifyContent: 'flex-end', overflow: 'hidden',
  },
  bar: { width: '100%', borderRadius: radius.sm },
});
