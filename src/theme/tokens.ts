/**
 * Tasarım belirteçleri.
 *
 * İki kısıt biçimi belirliyor:
 * 1. Sürücü ekrana güneş altında ve gece bakıyor — kontrast yüksek olmalı,
 *    karanlık tema sonradan eklenen bir süs değil, birinci sınıf durum.
 * 2. Girişler tek elle, araç hareket hâlindeyken yapılıyor — dokunma
 *    hedefleri büyük, yazı tipleri okunaklı.
 *
 * Vurgu rengi kasıtlı olarak yeşil DEĞİL: yeşil ve kırmızı anlamsal olarak
 * kazanç ve gidere ayrılmış durumda. Etkileşim rengi bunlarla çakışırsa
 * "bu buton mu yoksa kâr mı" belirsizliği doğar.
 */

export interface Colors {
  background: string;
  surface: string;
  surfaceSunken: string;

  text: string;
  textSoft: string;
  textFaint: string;

  border: string;
  borderStrong: string;

  accent: string;
  accentText: string;
  accentSoft: string;

  positive: string;
  positiveSoft: string;
  negative: string;
  negativeSoft: string;
  warning: string;
  warningSoft: string;

  /**
   * Vurgu renginin beş kademeli tonu — açıktan koyuya.
   *
   * Isı şeridi, yoğunluk grafiği ve dolgu çubukları gibi TEK BİR DEĞERİN
   * ŞİDDETİNİ anlatan görseller için. Bunlar anlamsal renk değildir:
   * yeşil/kırmızı kazanç ve gidere ayrılmış, "çok/az" onlarla anlatılamaz.
   *
   * Palette olmayan ara tonları her ekranın kendi uydurmasını engelliyor —
   * uydurulan tonlar koyu temada çöküyor ve ekranlar birbirinden ayrışıyor.
   */
  accentScale: readonly [string, string, string, string, string];
}

export type ColorScheme = 'light' | 'dark';

/**
 * CANLI PALET — 23 Eylül 2026.
 *
 * Önceki palet (koyu petrol yeşili vurgu, yeşilimsi gri zemin) sürücüye
 * "aşırı soluk" geldi. Vurgu artık doygun mavi: beyaz yazıyla okunaklı
 * (AA), yeşil kazanç ve kırmızı giderle karışmıyor. Zemin nötr-soğuk,
 * kartlar beyaz; anlamsal renkler (kazanç/gider/uyarı) daha parlak ve
 * yumuşak zeminleri daha belirgin.
 */
export const palette: Record<ColorScheme, Colors> = {
  light: {
    background: '#F2F5FA',
    surface: '#FFFFFF',
    surfaceSunken: '#EAF0F8',

    text: '#0F172A',
    textSoft: '#475569',
    textFaint: '#7C8BA1',

    border: '#DFE6F0',
    borderStrong: '#C3CEDD',

    accent: '#2563EB',
    accentText: '#FFFFFF',
    accentSoft: '#DCE8FF',

    positive: '#16A34A',
    positiveSoft: '#D5F7E1',
    negative: '#DC2626',
    negativeSoft: '#FDE2E2',
    warning: '#C2410C',
    warningSoft: '#FFEDD5',

    accentScale: ['#DCE8FF', '#B3CCFF', '#7FA8FA', '#4B82F2', '#2563EB'],
  },
  dark: {
    background: '#0B1120',
    surface: '#141C2F',
    surfaceSunken: '#0A0F1C',

    text: '#EAF0FA',
    textSoft: '#A5B3C8',
    textFaint: '#6E7D95',

    border: '#222D44',
    borderStrong: '#33415E',

    accent: '#5B9BFF',
    accentText: '#081226',
    accentSoft: '#15264A',

    positive: '#4ADE80',
    positiveSoft: '#0E2E1B',
    negative: '#F87171',
    negativeSoft: '#3A1517',
    warning: '#FB923C',
    warningSoft: '#3A2210',

    accentScale: ['#15264A', '#1E3A7A', '#2F5BC0', '#4680F0', '#5B9BFF'],
  },
};

/**
 * Bir orana (0–1) karşılık gelen vurgu tonu.
 *
 * Aralık dışı ve sayı olmayan girdiler uçlara kırpılıyor: eksik veri
 * yüzünden görselin çökmesindense en açık tonu göstermek daha iyi.
 */
export function accentStep(
  colors: Colors, ratio: number,
): string {
  const steps = colors.accentScale;
  if (!Number.isFinite(ratio)) return steps[0];
  const index = Math.round(Math.min(1, Math.max(0, ratio)) * (steps.length - 1));
  return steps[index];
}

/**
 * Hazır avatar zeminleri — beyaz sembolle iki temada da okunaklı.
 * Sıra saklanan değerin parçası (`"bolt-3"`): DEĞİŞTİRME, yalnızca sona ekle.
 */
export const AVATAR_COLORS = [
  '#2563EB', '#16A34A', '#EA580C', '#9333EA', '#DB2777', '#0891B2',
] as const;

/** 4'ün katları — ölçek tutarlı kalsın diye ara değer kullanılmıyor. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

export const type = {
  display: { fontSize: 30, fontWeight: '700', letterSpacing: -0.6 },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 16, fontWeight: '400' },
  bodyStrong: { fontSize: 16, fontWeight: '600' },
  caption: { fontSize: 13, fontWeight: '400' },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8 },
} as const;

/**
 * Dokunma hedefi alt sınırı. Apple 44pt öneriyor; sürücü hareket hâlindeki
 * bir araçta dokunduğu için 52'ye çıkarıldı.
 */
export const HIT_SIZE = 52;
