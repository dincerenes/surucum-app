/**
 * Pusula — İstatistik'in ikinci bölümü: şehrin sıcak saatleri, günleri
 * ve bölgeleri. Ekran `src/app/(app)/(sekmeler)/istatistik.tsx`.
 *
 * `src/app` altında değil: oradaki her dosya bir ekran oluyor.
 *
 * HER ŞEY TAHMİN. Veri sürücü kayıtlarından değil, şehrin genel iş, okul,
 * gece hayatı, turizm ve ulaşım düzeninden derlendi (`pusula-data.ts`).
 * "Bilinmeyen tahmin edilmez" kuralı burada ancak şöyle tutuyor: en
 * üstte ve kartlarda "Tahmini" yazıyor, hiçbir yerde sayı ya da yüzde
 * gösterilmiyor (0–100 ölçeği sürücüye kesinlik gibi görünür) ve para
 * kelimesi geçmiyor — Pusula yoğunluk anlatır, "daha çok kazanırsın" demez.
 *
 * Isı rengi mavi `accentScale`: kırmızı/yeşil kazanç ve gidere, turuncu
 * uyarıya ayrılmış.
 */

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';

import { Card, Chip, ChipRow, Icon, Notice, TextLink } from '@/components/ui';
import { formatClock } from '@/lib/business-date';
import { DURATION, STAGGER } from '@/lib/motion';
import type { PusulaCity } from '@/lib/pusula-data';
import {
  type CityResolution, LEVEL_LABELS, SOURCE_LABELS,
  getDemandModel, hotDaysSentence, hotHoursSentence, needleRatio, orderedCities, pusulaSnapshot,
  waveLine,
} from '@/lib/pusula';
import { upperTr } from '@/lib/text';
import { useNow } from '@/lib/use-now';
import { HIT_SIZE, radius, space, type as typeScale, useTheme } from '@/theme/use-theme';
import { CompassDial } from './pusula/compass-dial';
import { RhythmChart } from './pusula/rhythm-chart';
import { WeekBars } from './pusula/week-bars';
import { ZoneSections } from './pusula/zones';

/**
 * Günlerin tonu en sakin günden en yoğun güne YAYILIYOR. Günler arası fark
 * küçük (en sakin gün bile en yoğunun %70'i); oranı doğrudan boyayınca
 * yedi çubuk da aynı boyda kalıyor ve grafik bir şey söylemiyordu.
 */
function spread(values: readonly number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max <= min) return values.map(() => 1);
  return values.map((v) => 0.15 + (0.85 * (v - min)) / (max - min));
}

interface Props {
  resolution: CityResolution;
  city: PusulaCity;
  onCityChange: (city: PusulaCity) => void;
}

/**
 * Ekran sırası sürücünün sorularının sırası: ŞU AN nasıl (kadran), ne
 * zaman çıkayım (sıradaki dalga, günün ritmi), hangi gün (hafta),
 * nereye (bölgeler). Eskiden her kart bir cümleyle cevap veriyordu ve
 * ekran okunacak bir metin yığınıydı; şimdi her sorunun bir görseli var,
 * cümleler yalnızca ekran okuyucu etiketlerinde ve kısa satırlarda.
 *
 * Kartlar açılışta sırayla beliriyor; "Hareketi azalt" açıksa Reanimated
 * girişleri atlıyor.
 */
export function PusulaView({ resolution, city, onCityChange }: Props) {
  const { colors } = useTheme();
  /** Dakikada bir: kadran ve "şimdi" çizgisi saat ilerledikçe kendiliğinden değişsin. */
  const now = useNow(60_000);
  const minute = Math.floor(now / 60_000);
  const [dayOffset, setDayOffset] = useState(0);

  const model = getDemandModel(city);
  const snap = useMemo(
    () => pusulaSnapshot(model, new Date(minute * 60_000), dayOffset),
    [model, minute, dayOffset],
  );
  const label = SOURCE_LABELS[snap.source];
  const at = new Date(minute * 60_000);
  const wave = waveLine(snap.now, at);
  const nowSlot = snap.day.nowIndex == null ? null : snap.day.nowIndex + at.getMinutes() / 60;

  let order = 0;
  const enter = () => FadeInDown.duration(DURATION.base).delay(order++ * STAGGER)
    .easing(Easing.out(Easing.cubic));

  return (
    <>
      <CityPicker resolution={resolution} city={city} onChange={onCityChange}
        meta={`${label} · ${snap.updated}`} />

      <Animated.View entering={enter()}>
        <Card>
          <CompassDial level={snap.now.level} ratio={needleRatio(snap.now.value)} />
          <View style={styles.nowText}>
            <Text style={[styles.eyebrow, { color: colors.textFaint }]}>
              {`ŞU AN · ${formatClock(now)} · ${upperTr(label)}`}
            </Text>
            <Text style={[typeScale.title, { color: colors.text }]}>
              {LEVEL_LABELS[snap.now.level]}
            </Text>
          </View>
          <View style={[styles.wave, {
            backgroundColor: wave.active ? colors.accentSoft : colors.warningSoft,
          }]}>
            <Icon
              name={{ ios: 'flame.fill', android: 'local_fire_department' }}
              size={18}
              color={wave.active ? colors.accent : colors.warning}
            />
            <Text style={[typeScale.bodyStrong, styles.waveTitle, {
              color: wave.active ? colors.accent : colors.warning,
            }]}>
              {wave.title}
            </Text>
            {wave.pill ? (
              <View style={[styles.wavePill, { backgroundColor: colors.surface }]}>
                <Text style={[typeScale.caption, styles.wavePillText, {
                  color: wave.active ? colors.accent : colors.warning,
                }]}>
                  {wave.pill}
                </Text>
              </View>
            ) : null}
          </View>
        </Card>
      </Animated.View>

      <Animated.View entering={enter()}>
        <Card title="Günün ritmi" meta={label} icon={{ ios: 'waveform.path.ecg', android: 'monitor_heart' }}>
          <ChipRow>
            {snap.days.map((d) => (
              <Chip
                key={d.offset}
                label={d.label}
                selected={d.offset === dayOffset}
                onPress={() => setDayOffset(d.offset)}
              />
            ))}
          </ChipRow>
          <RhythmChart
            cells={snap.day.cells}
            windows={snap.day.windows}
            now={nowSlot}
            accessibilityLabel={`${snap.day.option.fullName} için saatlik tahmini yoğunluk. ${
              hotHoursSentence(snap.day.windows)}`}
          />
        </Card>
      </Animated.View>

      {snap.zones.some((z) => z.status === 'active') ? (
        <Animated.View entering={enter()} style={styles.zones}>
          <ZoneSections zones={snap.zones} meta={label} part="active" />
        </Animated.View>
      ) : null}

      <Animated.View entering={enter()}>
        <Card title="Hafta" meta={label} icon={{ ios: 'calendar', android: 'calendar_month' }}>
          <WeekBars
            values={spread(snap.week.ranks.map((r) => r.value))}
            best={snap.week.best}
            todayIndex={snap.week.todayIndex}
            accessibilityLabel={`Haftanın günlerine göre tahmini yoğunluk. ${
              hotDaysSentence(snap.week.best, snap.week.quietest)}`}
          />
          <Text style={[typeScale.caption, { color: colors.textSoft }]}>
            {hotDaysSentence(snap.week.best, snap.week.quietest)}
          </Text>
        </Card>
      </Animated.View>

      <Animated.View entering={enter()} style={styles.zones}>
        <ZoneSections zones={snap.zones} meta={label} part="rest" />
      </Animated.View>
    </>
  );
}

/**
 * Şehir seçimi — kapalıyken tek bir hap: seçili şehir ve "şehrin"
 * işareti. Dört şehrin dört büyük çipi her açılışta ekranın ilk
 * satırını kaplıyordu; sürücü şehir neredeyse hiç değiştirmiyor.
 * Dokununca çipler açılıyor.
 *
 * Şehri desteklenmiyorsa ya da hiç seçilmemişse bunu SÖYLÜYOR ve yine de
 * dört şehre bakabiliyor. Şehir seçilmemişse düzeltme yolu da burada:
 * uyarı düzeltilemiyorsa suçlamadır (docs/mimari.md, "Bilinmeyen tahmin edilmez").
 */
function CityPicker({
  resolution, city, onChange, meta,
}: {
  resolution: CityResolution; city: PusulaCity; onChange: (c: PusulaCity) => void; meta: string;
}) {
  const { colors } = useTheme();
  const own = resolution.kind === 'supported' ? resolution.city : null;
  // Kendi şehri yoksa seçim açık gelsin: sürücü hangi şehre baktığını seçmeli.
  const [open, setOpen] = useState(own == null);

  return (
    <View style={styles.cities}>
      <View style={styles.cityRow}>
        <Pressable
          onPress={() => setOpen((o) => !o)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`Şehir: ${city}${city === own ? ', senin şehrin' : ''}. Değiştir`}
          style={({ pressed }) => [styles.cityPill, {
            backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1,
          }]}
        >
          <Icon name={{ ios: 'mappin.circle.fill', android: 'location_on' }} size={18} color={colors.accent} />
          <Text style={[typeScale.bodyStrong, { color: colors.text }]}>{city}</Text>
          {city === own ? (
            <Text style={[typeScale.caption, { color: colors.textFaint }]}>şehrin</Text>
          ) : null}
          <Icon
            name={open
              ? { ios: 'chevron.up', android: 'expand_less' }
              : { ios: 'chevron.down', android: 'expand_more' }}
            size={12}
            color={colors.textFaint}
          />
        </Pressable>
        <Text style={[typeScale.caption, styles.cityMeta, { color: colors.textFaint }]} numberOfLines={1}>
          {meta}
        </Text>
      </View>

      {open ? (
        <ChipRow>
          {orderedCities(resolution).map((c) => (
            <Chip
              key={c}
              label={c}
              detail={c === own ? 'şehrin' : undefined}
              selected={c === city}
              onPress={() => {
                onChange(c);
                if (own != null) setOpen(false);
              }}
            />
          ))}
        </ChipRow>
      ) : null}

      {resolution.kind === 'unsupported' ? (
        <Notice>
          {`Pusula şimdilik İstanbul, Ankara, İzmir ve Antalya'da. ${resolution.ownCity} için `
            + 'yakında; o zamana kadar bu dört şehre bakabilirsin.'}
        </Notice>
      ) : null}

      {resolution.kind === 'missing' ? (
        <>
          <Notice>
            Şehrini seçmedin. Seçersen Pusula hep senin şehrinle açılır; şimdilik
            yukarıdan istediğin şehre bakabilirsin.
          </Notice>
          <TextLink label="Şehrini seç" href="/profil-duzenle" align="left" />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cities: { gap: space.sm },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  cityPill: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: HIT_SIZE,
    borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.lg,
  },
  cityMeta: { flex: 1, textAlign: 'right' },
  nowText: { alignItems: 'center', gap: 2 },
  eyebrow: { ...typeScale.label, letterSpacing: 1 },
  wave: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    borderRadius: radius.md, padding: space.md, marginTop: space.sm,
  },
  waveTitle: { flex: 1 },
  wavePill: { borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 3 },
  wavePillText: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  zones: { gap: space.lg },
});
