/**
 * Türkçe büyük harf.
 *
 * `toUpperCase()` ve React Native'in `textTransform: 'uppercase'` dili
 * bilmiyor: "Kilometre" → "KILOMETRE", "Nisan" → "NISAN". Doğrusu
 * "KİLOMETRE", "NİSAN". Noktalı küçük i'yi önce noktalı büyük İ'ye
 * çeviriyoruz; noktasız ı zaten I oluyor.
 *
 * Hermes'in `toLocaleUpperCase('tr-TR')` desteği platformdan platforma
 * değişiyor; bu tek satır her yerde aynı sonucu veriyor.
 */
export function upperTr(text: string): string {
  return text.replace(/i/g, 'İ').toUpperCase();
}
