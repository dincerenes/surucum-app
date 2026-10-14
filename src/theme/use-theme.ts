/**
 * Tema erişiminin tek kapısı.
 *
 * Gerçek uygulama `theme-context.tsx` içinde: tercih orada BİR KEZ
 * okunuyor. Bu dosya yalnızca yeniden dışa aktarıyor ki uygulamadaki
 * yüzlerce `@/theme/use-theme` importu olduğu gibi kalsın.
 */

export { ThemeProvider, useTheme } from './theme-context';
export * from './tokens';
