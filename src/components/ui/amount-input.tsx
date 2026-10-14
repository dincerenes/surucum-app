import { useEffect, useRef, useState } from 'react';
import {
  Dimensions, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { type Kurus, formatKurus, parseAmount } from '@/lib/money';
import { formatNumberInput, normalizeTypedNumber } from '@/lib/number-input';
import { upperTr } from '@/lib/text';
import { radius, space, type as typeScale, useTheme } from '@/theme/use-theme';

interface Props {
  value: string;
  onChangeText: (raw: string) => void;
  /** Girdi çözümlenince çağrılır; okunamayan girdide `null`. */
  onValueChange?: (value: Kurus | null) => void;
  label?: string;
  placeholder?: string;
  /** Alan açılır açılmaz klavye gelsin mi? Sefer ekleme sayfasında evet. */
  autoFocus?: boolean;
  /** Sağda birim etiketi — "₺", "lt", "km". */
  unit?: string;
  hint?: string;
  /**
   * Tam sayı alanlarında (kilometre) `number-pad`: ayraç tuşu hiç
   * çıkmaz, sürücü "238,5" yazamaz. Bulutta bu sütunlar `integer` ve
   * ondalık değer orada reddediliyor. Tutarlar için varsayılan kalır.
   */
  keyboard?: 'decimal-pad' | 'number-pad';
}

/**
 * Büyük tutar girişi — sefer ekleme sayfasının kalbi.
 *
 * SİSTEM KLAVYESİ kullanılıyor, özel tuş takımı değil. Ondalık modu
 * Türkçe yerel ayarda virgülü zaten veriyor; özel tuş takımında virgül
 * yoktu ve `187,50 ₺` girilemiyordu.
 *
 * Girdi `parseAmount` ile okunuyor: okunamayan girdi `null` döner,
 * ASLA sıfıra düşmez. Sıfıra düşseydi sürücü yanlış yazdığını fark
 * etmeden bedava sefer kaydeder.
 */
export function AmountInput({
  value, onChangeText, onValueChange, label, placeholder = '0',
  autoFocus = false, unit = '₺', hint, keyboard = 'decimal-pad',
}: Props) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const ref = useRef<TextInput>(null);

  useEffect(() => {
    if (!autoFocus) return;
    /**
     * Bir kare beklemek şart: alttan açılan sayfa animasyonu bitmeden
     * odaklanınca iOS klavyeyi açmıyor ve alan sessizce boş kalıyor.
     */
    const id = setTimeout(() => ref.current?.focus(), 120);
    return () => clearTimeout(id);
  }, [autoFocus]);

  /**
   * Basamaklar YAZARKEN ayrılıyor: 150000 → 150.000. Dışarıdan gelen
   * değer (ön dolgu) de aynı biçimde gösteriliyor; `normalizeTypedNumber`
   * çıktısı bu biçimin sabit noktası, yazılan kaymıyor.
   */
  const allowDecimal = keyboard === 'decimal-pad';
  const shown = formatNumberInput(value, allowDecimal);
  const parsed = parseAmount(shown);
  const invalid = shown.trim().length > 0 && parsed === null;

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text style={[styles.label, { color: colors.textSoft }]}>{upperTr(label)}</Text>
      ) : null}

      <View
        style={[
          styles.box,
          {
            backgroundColor: colors.surface,
            borderColor: invalid ? colors.negative : focused ? colors.accent : colors.border,
            borderWidth: focused || invalid ? 2 : 1,
          },
        ]}
      >
        <TextInput
          ref={ref}
          value={shown}
          onChangeText={(next) => {
            const normalized = normalizeTypedNumber(next, shown, allowDecimal);
            onChangeText(normalized);
            onValueChange?.(parseAmount(normalized));
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          keyboardType={keyboard}
          inputMode={keyboard === 'number-pad' ? 'numeric' : 'decimal'}
          style={[styles.input, { color: invalid ? colors.negative : colors.text }]}
          accessibilityLabel={label}
        />
        <Text style={[typeScale.title, { color: colors.textFaint }]}>{unit}</Text>
      </View>

      {invalid ? (
        <Text style={[typeScale.caption, { color: colors.negative }]}>
          Tutar okunamadı
        </Text>
      ) : hint ? (
        <Text style={[typeScale.caption, { color: colors.textFaint }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

/**
 * İçeriği klavyenin üstünde tutan kap.
 *
 * iOS'ta sayı klavyesi ekranın altını kaplıyor. Kaydet butonu arkada
 * kalırsa sürücü kaydetmek için önce klavyeyi kapatmak zorunda kalır ve
 * girişten kazanılan hız geri verilir.
 *
 * iPhone'da alttan açılan sayfa ekranın tepesinden değil, biraz aşağıdan
 * başlayan bir KART ve kendi penceresi gibi ölçülüyor: içindeki her şey
 * kartın tepesine göre konumlanıyor, klavye ise ekrana göre bildiriliyor.
 * `KeyboardAvoidingView` aradaki farkı (iPhone 17 Pro'da 62 nokta) bilmediği
 * için Kaydet butonu o kadar klavyenin altında kalıyordu (7 Ekim 2026, ilk
 * kullanıcı geri bildirimi; simülatörde yeniden üretildi). Kartın alt
 * kenarı ekranın altına oturuyor, yani fark = ekran yüksekliği − kartın
 * klavyesiz yüksekliği; bu `keyboardVerticalOffset` olarak veriliyor. Tam
 * ekran sayfalarda fark sıfır, davranış değişmiyor.
 *
 * Yedek olarak klavye kapatılabiliyor: sayı klavyesinde "Bitti" tuşu
 * yok, ölçüm bir cihazda yine tutmazsa sürücü Kaydet'e ulaşamadan
 * sayfada sıkışıp kalmasın. Kaydırılan sayfalarda sayfayı kaydırmak
 * klavyeyi kapatıyor (`keyboardDismissMode="on-drag"`, ScrollView'da);
 * kaydırılmayan kısa sayfalarda (`dismissOnTap`) boş yere dokunmak.
 *
 * Dokunma yakalayıcı YALNIZCA kaydırılmayan sayfalarda: kaydırılan bir
 * sayfayı sarınca boşluktan başlayan parmak hareketini o yakalıyor ve
 * sayfa kaymıyordu (7–13 Ekim 2026 arası yayında; kullanıcı fark etti).
 */
export function AboveKeyboard({
  children, dismissOnTap = false,
}: { children: React.ReactNode; dismissOnTap?: boolean }) {
  const ref = useRef<View>(null);
  const [offset, setOffset] = useState(0);
  const Wrapper = dismissOnTap ? Pressable : View;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={offset}
      style={styles.avoider}
    >
      <Wrapper
        ref={ref}
        style={styles.avoider}
        {...(dismissOnTap ? { onPress: Keyboard.dismiss, accessible: false } : {})}
        onLayout={() => {
          if (Platform.OS !== 'ios') return;
          ref.current?.measureInWindow((_x, y, _w, h) => {
            // Klavye açıkken kap kısalıyor; yalnızca klavyesiz ölçüm geçerli.
            // (Kart açılırken ilk ölçüm tam ekran gelir, sonra kartın boyuna
            // iner; en büyüğü değil, en sonuncusu alınıyor.)
            if (Keyboard.isVisible()) return;
            const screen = Dimensions.get('screen').height;
            const gap = screen - (y + h);
            // Kart farkı birkaç on nokta. 1.0.1 TestFlight'ta (7 Ekim 2026)
            // kurulum sayfasında boşluk klavye boyu kadar fazla çıktı, alan
            // ekranın ortasında kesik kaldı: klavye açılırken kısalan kap
            // `isVisible()` henüz doğru dönmeden ölçülmüş olmalı (simülatörde
            // üretilemedi). Klavye boyunda bir fark kart farkı olamaz, alınmaz.
            if (!Number.isFinite(gap) || gap > screen * 0.2) return;
            setOffset(Math.max(0, Math.round(gap)));
          });
        }}
      >
        {children}
      </Wrapper>
    </KeyboardAvoidingView>
  );
}

/** Girilen ham metnin okunabilir hâli — onay satırlarında gösterilir. */
export function previewAmount(raw: string): string | null {
  const parsed = parseAmount(raw);
  return parsed === null ? null : formatKurus(parsed);
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  /** Büyük harf `upperTr` ile — `textTransform` Türkçe İ'yi bilmiyor. */
  label: { ...typeScale.label },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  input: {
    flex: 1,
    ...typeScale.display,
    fontVariant: ['tabular-nums'],
    paddingVertical: space.xs,
  },
  avoider: { flex: 1 },
});
