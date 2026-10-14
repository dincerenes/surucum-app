import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

/**
 * Supabase istemcisi.
 *
 * TASARIM KARARI — bulut ZORUNLU DEĞİLDİR. Uygulama, Supabase hiç
 * yapılandırılmamış olsa bile eksiksiz çalışır: kayıt cihazdaki SQLite'a
 * düşer, raporlar oradan üretilir. Bulut yalnızca yedek, cihaz değiştirme
 * ve çoklu cihaz içindir.
 *
 * Bu yüzden istemci `null` olabilir ve çağıran taraf bunu ele almak
 * zorundadır. Ortam değişkeni eksikse uygulama çökmez, sadece senkron
 * devre dışı kalır.
 */

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let client: SupabaseClient | null = null;
let autoRefreshBound = false;

/**
 * Oturum saklama için AsyncStorage kullanılıyor, SecureStore değil.
 *
 * SecureStore'un değer başına 2048 bayt sınırı var; Supabase oturumu
 * (erişim jetonu + yenileme jetonu + kullanıcı nesnesi) bunu rahatlıkla
 * aşıyor ve oturum sessizce kaydedilemiyor. Jetonlar zaten kısa ömürlü ve
 * cihaz depolaması uygulama korumalı alanında.
 */
export function getSupabase(): SupabaseClient | null {
  if (client) return client;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return null;
  }

  client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      // React Native'de URL üzerinden oturum yakalama diye bir şey yok;
      // açık bırakılırsa her açılışta gereksiz iş yapar.
      detectSessionInUrl: false,
      // E-posta kurtarma bağlantısındaki tek kullanımlık kod uygulamada
      // exchangeCodeForSession ile çevrilir; jeton URL'ye konmaz.
      flowType: 'pkce',
    },
  });

  bindAutoRefresh(client);
  return client;
}

/**
 * Uygulama arka plandayken jeton yenilemeyi durdurur.
 *
 * Durdurulmazsa zamanlayıcı arka planda çalışmaya devam eder, iOS onu
 * askıya alır ve uygulama öne döndüğünde yarım kalmış yenileme istekleri
 * "Invalid Refresh Token" hatası üretir.
 */
function bindAutoRefresh(supabase: SupabaseClient): void {
  if (autoRefreshBound) return;
  autoRefreshBound = true;

  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}

/** Bulut yapılandırılmış mı? Senkron ve yedekleme bunu kontrol eder. */
export function isCloudConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}
