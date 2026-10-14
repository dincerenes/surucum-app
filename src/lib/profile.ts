/**
 * Profil yardımcıları — ad, selamlama, hazır avatarın harfi.
 *
 * Veritabanı ve arayüz bilmez; test edilir.
 */

import { upperTr } from './text.ts';

/** Adın en fazla uzunluğu. Bulutta 60 karakter sınırı var, pay bırakıldı. */
export const MAX_DISPLAY_NAME = 40;

/** Boş ya da yalnızca boşluk olan metin `null` — "girilmedi" demek. */
export function blankToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Adı saklanacak hâle getirir: baştaki/sondaki ve aradaki fazla boşluk
 * gidiyor, uzunluk kırpılıyor. Boşsa `null`.
 */
export function normalizeDisplayName(value: string | null | undefined): string | null {
  const clean = blankToNull(value?.replace(/\s+/g, ' '));
  return clean == null ? null : clean.slice(0, MAX_DISPLAY_NAME).trim();
}

/**
 * Selamlamada kullanılan ad — İLK AD. "Günaydın Mehmet Ali Yılmaz"
 * ekrana sığmıyor ve kimse kendine tam adıyla seslenmiyor.
 */
export function firstName(displayName: string | null | undefined): string | null {
  const clean = normalizeDisplayName(displayName);
  return clean ? clean.split(' ')[0] : null;
}

/**
 * Saate göre selamlama.
 *
 *   05–11 Günaydın · 11–17 Tünaydın · 17–22 İyi akşamlar · 22–05 İyi geceler
 *
 * Alt sınır dahil, üst sınır hariç: 11:00 artık Tünaydın.
 */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 11) return 'Günaydın';
  if (hour >= 11 && hour < 17) return 'Tünaydın';
  if (hour >= 17 && hour < 22) return 'İyi akşamlar';
  return 'İyi geceler';
}

/**
 * Günün evresi — Anasayfa başlığının ikonu ve rengi.
 *
 * Sınırlar `greetingFor` ile AYNI: başlık "Günaydın" derken ay ikonu
 * göstermek sürücüye uygulamanın saati bilmediğini düşündürür.
 */
export type DayPhase = 'sabah' | 'gunduz' | 'aksam' | 'gece';

export function dayPhase(hour: number): DayPhase {
  if (hour >= 5 && hour < 11) return 'sabah';
  if (hour >= 11 && hour < 17) return 'gunduz';
  if (hour >= 17 && hour < 22) return 'aksam';
  return 'gece';
}

/** Hazır avatarın harfi — adın baş harfi, Türkçe büyük. Ad yoksa `null`. */
export function initialOf(displayName: string | null | undefined): string | null {
  const clean = normalizeDisplayName(displayName);
  return clean ? upperTr(clean.charAt(0)) : null;
}

/**
 * Hazır avatarlar — bir sembol ve bir renk.
 *
 * Saklanan değer `"<sembol>-<renk>"` (ör. `"bolt-3"`). `harf` sembolü
 * adın baş harfi. Fotoğraf yükleme ayrı bir adım (depolama gerekiyor);
 * o gelene kadar sürücü kendini bunlarla ifade ediyor.
 */
export const AVATAR_SYMBOLS = ['harf', 'car', 'taxi', 'star', 'bolt', 'crown', 'flame', 'leaf'] as const;
export type AvatarSymbol = (typeof AVATAR_SYMBOLS)[number];

/** Avatar zeminleri — beyaz sembolle iki temada da okunaklı, doygun renkler. */
export const AVATAR_COLOR_COUNT = 6;

export interface AvatarChoice {
  symbol: AvatarSymbol;
  /** 0..AVATAR_COLOR_COUNT-1. `null`: seçilmemiş, varsayılan görünüm. */
  color: number | null;
}

/** Saklanan değeri okur. Boş ya da tanınmayan değer varsayılan avatar. */
export function parseAvatar(value: string | null | undefined): AvatarChoice {
  const match = /^([a-z]+)-(\d)$/.exec(value ?? '');
  if (!match) return { symbol: 'harf', color: null };
  const symbol = match[1] as AvatarSymbol;
  const color = Number(match[2]);
  if (!AVATAR_SYMBOLS.includes(symbol) || color >= AVATAR_COLOR_COUNT) {
    return { symbol: 'harf', color: null };
  }
  return { symbol, color };
}

export function formatAvatar(choice: AvatarChoice): string | null {
  if (choice.color == null) return null;
  return `${choice.symbol}-${choice.color}`;
}
