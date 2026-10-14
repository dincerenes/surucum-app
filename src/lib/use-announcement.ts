import { useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

import { getPref, setPref } from '@/db/repo';
import { useAuth } from '@/lib/auth/auth-context';
import {
  type Announcement, DISMISSED_PREF_KEY, addDismissed, parseAnnouncementRow, parseDismissed,
  pickAnnouncement, shouldRefresh,
} from '@/lib/announcements';
import { getSupabase } from '@/lib/supabase';
import { useNow } from '@/lib/use-now';

/**
 * Anasayfa duyuru bandının verisi.
 *
 * Çekilenler modül düzeyinde tutuluyor: sekmeler arasında gezerken ve
 * ekran yeniden kurulurken her seferinde istek atılmasın. Sunucuya en
 * fazla birkaç dakikada bir soruluyor (`ANNOUNCEMENT_REFRESH_MS`), ama
 * seçim her çizimde yeniden yapılıyor — süresi dolan duyuru bant
 * olarak kalmasın.
 *
 * Bulut yoksa, oturum yoksa ya da ağ hata verirse HİÇBİR ŞEY gösterilmez
 * ve hata kullanıcıya yansımaz: duyuru bandı uygulamanın çalışmasının
 * koşulu değil.
 */
let cachedRows: Announcement[] = [];
let lastFetchedAt: number | null = null;
let inFlight = false;

async function fetchRows(): Promise<Announcement[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('announcements')
      .select('id, title, body, severity, platform, min_app_version, starts_at, ends_at, is_active')
      .order('starts_at', { ascending: false })
      .limit(10);
    if (error || !Array.isArray(data)) return null;
    const now = Date.now();
    return data
      .map((row) => parseAnnouncementRow(row, now))
      .filter((a): a is Announcement => a != null);
  } catch {
    return null;
  }
}

export function useAnnouncement(): { announcement: Announcement | null; dismiss: () => void } {
  const { session } = useAuth();
  const signedIn = session != null;
  // Dakikada bir: süresi dolan duyuru, ekran açık kalsa da bandı bıraksın.
  const now = useNow(60_000);

  const [rows, setRows] = useState<Announcement[]>(cachedRows);
  const [dismissed, setDismissed] = useState<string[]>(() => parseDismissed(getPref(DISMISSED_PREF_KEY)));

  // Ekran odaklanınca (uygulama açılışı dahil) — süre dolmadıysa istek atılmaz.
  useFocusEffect(useCallback(() => {
    if (!signedIn || inFlight || !shouldRefresh(lastFetchedAt, Date.now())) return;
    inFlight = true;
    void fetchRows().then((fresh) => {
      inFlight = false;
      if (!fresh) return; // ağ hatası: eski liste kalsın, bir sonraki odaklanmada tekrar denenir
      cachedRows = fresh;
      lastFetchedAt = Date.now();
      setRows(fresh);
    });
  }, [signedIn]));

  const announcement = signedIn
    ? pickAnnouncement(rows, {
      platform: Platform.OS,
      appVersion: Constants.expoConfig?.version ?? null,
      now,
      dismissed,
    })
    : null;

  const dismiss = useCallback(() => {
    if (!announcement) return;
    const next = addDismissed(dismissed, announcement.id);
    setDismissed(next);
    setPref(DISMISSED_PREF_KEY, JSON.stringify(next));
  }, [announcement, dismissed]);

  return { announcement, dismiss };
}
