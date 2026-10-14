/**
 * Cihaz tercihleri — buluta GİTMEZ, `outbox`'a hiç uğramaz.
 *
 * Tema burada duruyor çünkü aynı hesabı iki cihazda kullanan sürücünün
 * telefonu koyu, tableti açık olabilir. Senkronlasaydık bir cihazda
 * yapılan seçim diğerinin ekranını da çevirirdi.
 */

import { eq } from 'drizzle-orm';
import { getDb } from '../client';
import { devicePrefs } from '../schema';
import type { UnixMs } from './_base';

/** Tema tercihi. `system` cihazın kendi ayarını izler. */
export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const THEME_LABELS: Record<ThemePreference, string> = {
  system: 'Sistem',
  light: 'Açık',
  dark: 'Koyu',
};

const THEME_KEY = 'theme';

export function getPref(key: string): string | null {
  return getDb().select().from(devicePrefs)
    .where(eq(devicePrefs.key, key)).get()?.value ?? null;
}

export function setPref(key: string, value: string | null, now: UnixMs = Date.now()): void {
  getDb().insert(devicePrefs)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: devicePrefs.key,
      set: { value, updatedAt: now },
    })
    .run();
}

/**
 * Tema tercihi. Tanınmayan değer `system`'e düşer — eski bir sürümden
 * kalan ya da elle bozulmuş bir kayıt ekranı kilitlememeli.
 */
export function getThemePreference(): ThemePreference {
  const raw = getPref(THEME_KEY);
  return (THEME_PREFERENCES as readonly string[]).includes(raw ?? '')
    ? (raw as ThemePreference)
    : 'system';
}

export function setThemePreference(value: ThemePreference, now: UnixMs = Date.now()): void {
  setPref(THEME_KEY, value, now);
}
