/**
 * Uygulama içi geri bildirim.
 *
 * Sürücü destek adresini görmüyor: mesaj doğrudan buluttaki `feedback`
 * tablosuna yazılıyor (yalnızca ekleme; sürücü okuyamaz, silemez). Senkron
 * kuyruğuna GİRMİYOR — çevrimdışıyken gönderilemez ve sürücüye söylenir;
 * sessizce bekletilen bir mesaj "gönderildi" sanılıp unutulurdu.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getSupabase } from './supabase';

export const FEEDBACK_CATEGORIES = ['hata', 'istek', 'oneri', 'diger'] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_LABELS: Record<FeedbackCategory, string> = {
  hata: 'Hata',
  istek: 'İstek',
  oneri: 'Öneri',
  diger: 'Diğer',
};

export const MAX_FEEDBACK = 2000;

export type FeedbackResult = { ok: true } | { ok: false; error: string };

/** Gönderilecek mesajı temizler; boşsa ya da çok uzunsa hata. */
export function validateFeedback(message: string): string | null {
  const trimmed = message.trim();
  if (trimmed.length === 0) return 'Bir şeyler yaz, sonra gönder.';
  if (trimmed.length > MAX_FEEDBACK) return `En fazla ${MAX_FEEDBACK} karakter yazabilirsin.`;
  return null;
}

export async function sendFeedback(
  category: FeedbackCategory, message: string,
): Promise<FeedbackResult> {
  const problem = validateFeedback(message);
  if (problem) return { ok: false, error: problem };

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Bulut bağlantısı yapılandırılmamış.' };

  try {
    const { error } = await supabase.from('feedback').insert({
      category,
      message: message.trim(),
      app_version: Constants.expoConfig?.version ?? null,
      platform: `${Platform.OS} ${Platform.Version}`.slice(0, 40),
    });
    if (error) return { ok: false, error: 'Gönderilemedi, biraz sonra tekrar dene.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'İnternet bağlantısı yok. Bağlanınca tekrar dene.' };
  }
}
