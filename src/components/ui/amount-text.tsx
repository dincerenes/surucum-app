import { StyleSheet, Text, type TextStyle } from 'react-native';
import { type Kurus, formatKurus } from '@/lib/money';
import { useCountUp } from '@/lib/motion';
import { type as typeScale, useTheme } from '@/theme/use-theme';

type Size = 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'caption';

interface Props {
  value: Kurus;
  size?: Size;
  /**
   * Renklendirme.
   * - `signed`: pozitif yeşil, negatif kırmızı
   * - `cost`: her zaman kırmızı — gider satırları için, tutar pozitif yazılsa da
   * - `plain`: nötr metin rengi
   */
  tone?: 'signed' | 'cost' | 'plain';
  /** Gider satırlarında başa eksi koyar: `−520,00 ₺` */
  showMinus?: boolean;
  symbol?: boolean;
  style?: TextStyle;
  /**
   * Değer değişince eskisinden yenisine SAYARAK gider. `'mount'`:
   * ilk görünüşte de sıfırdan sayar — ödül anları ve ana kart için.
   *
   * Renk ve eksi işareti SON değere göre seçiliyor, ara değere göre
   * değil: sayım sıfırdan geçerken rakamın yeşil-kırmızı yanıp sönmesi
   * sürücüye yanlış bir şey söyler.
   */
  animate?: boolean | 'mount';
}

/**
 * Para gösterimi.
 *
 * `tabular-nums` ZORUNLU: alt alta gelen tutarların rakamları hizalanmazsa
 * sürücü sütunu okuyamıyor. Uygulamanın her yerinde para bu bileşenden
 * geçiyor; ham `formatKurus` çıktısı doğrudan `Text` içine yazılmıyor.
 */
export function AmountText({
  value, size = 'body', tone = 'plain', showMinus = false,
  symbol = true, style, animate = false,
}: Props) {
  const { colors } = useTheme();
  const shown = useCountUp(value, {
    enabled: animate !== false, fromZero: animate === 'mount',
  }) as Kurus;

  const color =
    tone === 'cost' ? colors.negative
    : tone === 'signed' ? (value < 0 ? colors.negative : colors.positive)
    : colors.text;

  const text = formatKurus(shown, { symbol });

  return (
    <Text style={[typeScale[size], styles.digits, { color }, style]}>
      {showMinus && value > 0 && shown > 0 ? `\u2212${text}` : text}
    </Text>
  );
}

const styles = StyleSheet.create({
  digits: { fontVariant: ['tabular-nums'] },
});
