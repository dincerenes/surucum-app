import { createContext, useCallback, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { type Colors, type ColorScheme, palette } from './tokens';
import { useDbValue } from '@/db/use-db';
import {
  type ThemePreference, getThemePreference, setThemePreference,
} from '@/db/repo/prefs';

interface ThemeValue {
  colors: Colors;
  scheme: ColorScheme;
  /** Sürücünün seçimi — `system` cihazın ayarını izler. */
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

/**
 * Tema tercihi TEK YERDEN okunuyor.
 *
 * `useTheme` uygulamadaki neredeyse her bileşende çağrılıyor. Tercihi
 * orada okusaydık her buton, her çip, her metin kendi veritabanı
 * değişiklik dinleyicisini açardı — yüzlerce dinleyici ve her yazmada
 * ağacın tamamının yeniden çizilmesi. Okuma burada bir kez yapılıyor,
 * aşağısı bağlamdan alıyor.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const device: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';

  /**
   * Okuma KORUMALI: bu sağlayıcı migration'lar koşmadan önce de
   * çiziliyor (hazırlanıyor ve hata ekranları da tema kullanıyor) ve
   * `device_prefs` tablosu o an henüz yok. Tema yüzünden uygulamanın
   * hiç açılmaması kabul edilemez; okunamayan tercih cihazın ayarına düşer.
   */
  const preference = useDbValue<ThemePreference>(() => {
    try {
      return getThemePreference();
    } catch {
      return 'system';
    }
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setThemePreference(next);
  }, []);

  const value = useMemo<ThemeValue>(() => {
    const scheme: ColorScheme = preference === 'system' ? device : preference;
    return { colors: palette[scheme], scheme, preference, setPreference };
  }, [device, preference, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Etkin tema.
 *
 * Sağlayıcı yoksa cihazın ayarına düşüyor — tema, bir bileşenin
 * çizilememesine sebep olmamalı.
 */
export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  const device: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';

  if (ctx) return ctx;
  return {
    colors: palette[device],
    scheme: device,
    preference: 'system',
    setPreference: () => {},
  };
}
