import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Icon, type IconName } from '@/components/ui';
import { formatClock } from '@/lib/business-date';
import type { ZoneKind } from '@/lib/pusula-data';
import { ZONE_KIND_LABELS, type ZoneView, formatZoneWindows } from '@/lib/pusula';
import { radius, space, type as typeScale, useTheme } from '@/theme/use-theme';

/**
 * Bölge türünün ikonu. Sürücü listeyi adla değil şekille tarıyor:
 * uçak, hastane, ay — hangisinin "şimdi" işine yaradığı bir bakışta.
 */
const KIND_ICONS: Record<ZoneKind, IconName> = {
  havalimani: { ios: 'airplane', android: 'flight' },
  'otogar-gar': { ios: 'bus.fill', android: 'directions_bus' },
  'is-merkezi': { ios: 'building.2.fill', android: 'apartment' },
  'eglence-gece': { ios: 'moon.stars.fill', android: 'nightlife' },
  alisveris: { ios: 'bag.fill', android: 'shopping_bag' },
  universite: { ios: 'graduationcap.fill', android: 'school' },
  turistik: { ios: 'camera.fill', android: 'photo_camera' },
  hastane: { ios: 'cross.case.fill', android: 'local_hospital' },
  sahil: { ios: 'beach.umbrella.fill', android: 'beach_access' },
  'konut-yogun': { ios: 'house.fill', android: 'home' },
  etkinlik: { ios: 'ticket.fill', android: 'confirmation_number' },
  diger: { ios: 'mappin', android: 'location_on' },
};

/** "Bugün sırada" ilk bakışta bu kadar adım; gerisi "Tümü" ile. */
const LATER_PREVIEW = 4;

const startClock = (v: ZoneView) => (v.start ? formatClock(v.start.getTime()) : '');

function KindIcon({ kind, size = 34 }: { kind: ZoneKind; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.kind, {
      width: size, height: size, borderRadius: size / 2, backgroundColor: colors.accentSoft,
    }]}>
      <Icon name={KIND_ICONS[kind]} size={size * 0.48} color={colors.accent} />
    </View>
  );
}

/** Üç nokta — pencerenin yoğunluğu. Sayı değil: Pusula kesinlik iddia etmiyor. */
function Intensity({ value }: { value: 1 | 2 | 3 }) {
  const { colors } = useTheme();
  return (
    <View style={styles.dots}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={[styles.dot, {
          backgroundColor: i <= value ? colors.accent : colors.border,
        }]} />
      ))}
    </View>
  );
}

/**
 * Bölgeler üç kümede, sürücünün sorusunun sırasıyla:
 *
 * 1. ŞİMDİ HAREKETLİ — yana kayan kartlar. "Şu an nereye?" sorusunun
 *    cevabı; kart başına tür ikonu, ilçe ve bitiş saati.
 * 2. BUGÜN SIRADA — saat saat zaman çizelgesi. Eskiden aynı listede
 *    "Bugün 16:00–20:00" rozetiydi; çizelge günün akışını gösteriyor ve
 *    bölgenin NEDEN hareketli olduğu (veri `reason`) altında yazıyor.
 * 3. DİĞERLERİ — kapalı; açınca gün ve saatleriyle düz liste.
 *
 * Satırlar dokunulabilir DEĞİL — bölgenin açılacak bir detayı yok.
 */
export function ZoneSections({ zones, meta, part = 'all' }: {
  zones: readonly ZoneView[];
  meta: string;
  /** 'active' yalnızca "Şimdi hareketli", 'rest' geri kalanı; ekran ikisini ayrı yerlere koyuyor. */
  part?: 'all' | 'active' | 'rest';
}) {
  const { colors } = useTheme();
  const [all, setAll] = useState(false);
  const [allLater, setAllLater] = useState(false);
  const active = zones.filter((z) => z.status === 'active');
  const later = zones.filter((z) => z.status === 'later');
  const other = zones.filter((z) => z.status === 'other');
  const laterShown = allLater ? later : later.slice(0, LATER_PREVIEW);

  return (
    <>
      {part !== 'rest' && active.length > 0 ? (
        <Card title="Şimdi hareketli" meta={`${meta} · ${active.length} bölge`}
          icon={{ ios: 'location.fill', android: 'near_me' }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cards}
            style={styles.cardsScroll}
          >
            {active.map((v) => (
              <View
                key={v.zone.id}
                style={[styles.card, { backgroundColor: colors.surfaceSunken }]}
                accessible
                accessibilityLabel={`${v.zone.name}, ${v.zone.district}. ${
                  v.end ? `Bitiş ${formatClock(v.end.getTime())}.` : ''}`}
              >
                <View style={styles.cardHead}>
                  <KindIcon kind={v.zone.kind} />
                  <Intensity value={v.intensity} />
                </View>
                <Text style={[typeScale.bodyStrong, { color: colors.text }]} numberOfLines={2}>
                  {v.zone.name}
                </Text>
                <Text style={[typeScale.caption, { color: colors.textSoft }]} numberOfLines={1}>
                  {v.zone.district}
                </Text>
                {v.end ? (
                  <Text style={[typeScale.caption, styles.until, { color: colors.accent }]}>
                    {`bitiş ${formatClock(v.end.getTime())}`}
                  </Text>
                ) : null}
              </View>
            ))}
          </ScrollView>
        </Card>
      ) : null}

      {part !== 'active' && later.length > 0 ? (
        <Card title="Bugün sırada" meta={meta} icon={{ ios: 'clock.fill', android: 'schedule' }}>
          {laterShown.map((v, i) => (
            <View
              key={v.zone.id}
              style={styles.step}
              accessible
              accessibilityLabel={`${startClock(v)} ${v.zone.name}. ${v.zone.reason}`}
            >
              {/* Aynı saatte açılan bölgeler tek saat başlığı altında: saat sütunu tekrar etmesin. */}
              <Text style={[typeScale.bodyStrong, styles.time, { color: colors.text }]}>
                {i > 0 && startClock(laterShown[i - 1]) === startClock(v) ? '' : startClock(v)}
              </Text>
              <View style={styles.rail}>
                <KindIcon kind={v.zone.kind} size={30} />
                {i < laterShown.length - 1 ? (
                  <View style={[styles.railLine, { backgroundColor: colors.border }]} />
                ) : null}
              </View>
              <View style={styles.stepText}>
                <Text style={[typeScale.bodyStrong, { color: colors.text }]}>{v.zone.name}</Text>
                <Text style={[typeScale.caption, { color: colors.textSoft }]}>{v.zone.reason}</Text>
              </View>
            </View>
          ))}
          {later.length > LATER_PREVIEW ? (
            <Button
              label={allLater ? 'Daha az göster' : `Tümü (${later.length})`}
              variant="ghost"
              onPress={() => setAllLater((a) => !a)}
            />
          ) : null}
        </Card>
      ) : null}

      {part !== 'active' && other.length > 0 ? (
        <Card title="Diğer bölgeler" meta={`${other.length} bölge`}
          icon={{ ios: 'mappin.and.ellipse', android: 'location_on' }}>
          {all ? other.map((v, i) => (
            <View
              key={v.zone.id}
              style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
              accessible
              accessibilityLabel={`${v.zone.name}, ${ZONE_KIND_LABELS[v.zone.kind]}. ${
                formatZoneWindows(v.zone.windows)}`}
            >
              <KindIcon kind={v.zone.kind} size={30} />
              <View style={styles.stepText}>
                <Text style={[typeScale.bodyStrong, { color: colors.text }]}>{v.zone.name}</Text>
                <Text style={[typeScale.caption, { color: colors.textSoft }]}>
                  {formatZoneWindows(v.zone.windows)}
                </Text>
              </View>
            </View>
          )) : (
            <Text style={[typeScale.body, { color: colors.textSoft }]}>
              Bugün öne çıkmayan ama haftanın başka saatlerinde hareketli bölgeler.
            </Text>
          )}
          <Button
            label={all ? 'Daha az göster' : `Göster (${other.length})`}
            variant="ghost"
            onPress={() => setAll((a) => !a)}
          />
        </Card>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  kind: { alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  /** Kartlar kenara kadar kaysın diye kartın iç boşluğu kadar taşıyor. */
  cardsScroll: { marginHorizontal: -space.lg },
  cards: { gap: space.sm, paddingHorizontal: space.lg },
  card: { width: 168, borderRadius: radius.md, padding: space.md, gap: space.xs },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: space.xs },
  until: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  step: { flexDirection: 'row', gap: space.md },
  time: { width: 48, paddingTop: 5, fontVariant: ['tabular-nums'] },
  rail: { alignItems: 'center' },
  railLine: { width: 2, flex: 1, minHeight: space.md },
  stepText: { flex: 1, gap: 2, paddingBottom: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.sm },
});
