import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PusulaView } from '@/components/pusula-view';
import {
  BestDayCard, CostsCard, EfficiencyCard, HotHoursCard, KmCard, PeriodCard, RidesCard, TimeCard,
} from '@/components/stats/stat-cards';
import { PeriodFilterBar, SegmentedControl, StatusBarScrim } from '@/components/ui';
import { useDbValue } from '@/db/use-db';
import { getSettings, getStatsOverview } from '@/db/repo';
import { useAuth } from '@/lib/auth/auth-context';
import type { PeriodKey } from '@/lib/period';
import { resolvePusulaCity } from '@/lib/pusula';
import type { PusulaCity } from '@/lib/pusula-data';
import { useBusinessToday } from '@/lib/use-business-today';
import { space, type as typeScale, useTheme } from '@/theme/use-theme';

type Section = 'kazancim' | 'pusula';

const SECTIONS = [
  { key: 'kazancim', label: 'Kazancım' },
  { key: 'pusula', label: 'Pusula' },
] as const satisfies readonly { key: Section; label: string }[];

/**
 * İstatistik — "nerede kazanıp nerede kaybediyorum".
 *
 * Anasayfa "bugün nasıl gidiyorum"u gösteriyor: kısa, anlık, filtresiz.
 * Burası derin ve dönem filtresine göre değişiyor. Aynı kart iki ekranda
 * durmuyor: "Son 7 gün" Anasayfa'da, burada dönemin kazanç seyri.
 *
 * Kart sırası sürücüyle kararlaştırıldı (23 Eylül 2026): dönem özeti,
 * verimlilik, zaman, sıcak saatler, en verimli gün, yolcu, km, gider.
 *
 * KULLANILAN TERİMLER SABİT: Ciro, Cebe kalan, Gerçek kâr. "Yolcu" =
 * sefer. Dönem filtresi Kayıtlar'la AYNI (`period.ts`).
 *
 * Platform ve ödeme şekline göre dağılım YOK: yolcu girilirken ikisi de
 * sorulmuyor (tek dokunuş kararı), sütunlar hep varsayılan değerde.
 *
 * İKİ BÖLÜM: "Kazancım" sürücünün kendi kayıtları (dönem filtresi ve
 * kartlar), "Pusula" şehrin tahmini sıcak saatleri, günleri ve bölgeleri
 * (`components/pusula-view.tsx`). Pusula ayrı sekme değil (sürücünün
 * kararı, 23 Eylül 2026): sekme çubuğu beşte kalıyor. Dönem filtresi
 * yalnızca Kazancım'ın — Pusula'nın verisi döneme bağlı değil.
 *
 * Bölüm, dönem ve Pusula şehri BU bileşende tutuluyor: sekme açık
 * kaldıkça bölümler arasında gidip gelince seçimler sıfırlanmasın.
 */
export default function StatsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [section, setSection] = useState<Section>('kazancim');
  const [period, setPeriod] = useState<PeriodKey>('month');
  /** Sürücünün Pusula'da seçtiği şehir; seçmediyse kendi şehri. */
  const [pickedCity, setPickedCity] = useState<PusulaCity | null>(null);
  const scroll = useRef<ScrollView>(null);

  /**
   * Başka bir ekrandan belirli bölüme gelmek için (`?bolum=kazancim`).
   * Okunduktan sonra temizleniyor: aynı değerle ikinci gelişte de
   * etkisini göstersin.
   */
  const { bolum } = useLocalSearchParams<{ bolum?: string }>();
  const [seenBolum, setSeenBolum] = useState<string | undefined>(undefined);
  if (bolum !== seenBolum) {
    setSeenBolum(bolum);
    if (bolum === 'kazancim' || bolum === 'pusula') setSection(bolum);
  }
  useEffect(() => {
    if (bolum) router.setParams({ bolum: undefined });
  }, [bolum]);

  // Gün dönünce "Bu hafta" / "Bu ay" yeni döneme geçsin.
  const today = useBusinessToday(userId);
  const data = useDbValue(() => {
    if (!userId || section !== 'kazancim') return null;
    return getStatsOverview(userId, period, today);
  }, [userId, period, section, today]);

  const ownCity = useDbValue(
    () => (userId ? getSettings(userId)?.city ?? null : null),
    [userId],
  );
  const resolution = resolvePusulaCity(ownCity);
  const pusulaCity = pickedCity
    ?? (resolution.kind === 'supported' ? resolution.city : resolution.fallback);

  const changeSection = (next: Section) => {
    setSection(next);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };

  return (
    <>
      <ScrollView
        ref={scroll}
        contentContainerStyle={[styles.page, { paddingTop: insets.top + space.lg }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[typeScale.display, { color: colors.text }]}>İstatistik</Text>

        <SegmentedControl
          options={SECTIONS}
          value={section}
          onChange={changeSection}
          accessibilityLabel="İstatistik bölümleri"
        />

        {section === 'pusula' ? (
          <PusulaView resolution={resolution} city={pusulaCity} onCityChange={setPickedCity} />
        ) : (
          <>
            <PeriodFilterBar value={period} onChange={setPeriod} />

            {/*
              * Kayıt olmasa da kartlar sıfırla görünüyor (sürücünün kararı):
              * sürücü kullanmaya başlamadan neyin geleceğini görsün.
              */}
            {data ? (
              <>
                <PeriodCard data={data} period={period} />
                <EfficiencyCard data={data} />
                <TimeCard data={data} />
                <HotHoursCard data={data} />
                <BestDayCard data={data} />
                <RidesCard data={data} />
                <KmCard data={data} />
                <CostsCard data={data} />
              </>
            ) : null}
          </>
        )}
      </ScrollView>
      <StatusBarScrim />
    </>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.lg },
});
