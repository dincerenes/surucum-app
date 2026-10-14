/**
 * Hareketin ortak ölçüsü.
 *
 * İKİ KURAL:
 * 1. Hiçbir hareket yarım saniyeyi geçmez. Sürücü ekrana araç hareket
 *    hâlindeyken yarım saniye bakıyor; bitmesini beklediği animasyon
 *    dikkati yoldan alır.
 * 2. Telefonda "Hareketi azalt" açıksa sayılar doğrudan son değerinde
 *    görünür. Reanimated'in giriş animasyonları bu ayara kendisi uyuyor;
 *    `useCountUp` gibi elle yazılanlar `useReducedMotion` ile uyuyor.
 */

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

export const DURATION = {
  /** Basma, renk değişimi. */
  fast: 180,
  /** Sayı sayma, halka dolması, kart girişi. */
  base: 450,
} as const;

/** Kartların sırayla belirmesi — kart başına gecikme. */
export const STAGGER = 60;

/** Hızlı başlayıp yumuşak duran eğri. */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Bir sayıyı öncekinden yenisine SAYARAK götürür.
 *
 * `fromZero`: ilk görünüşte sıfırdan saymaya başla. Kapalıyken ilk
 * değer doğrudan görünür ve yalnızca sonraki değişimler sayılır —
 * ekran her açılışta aynı sayıyı yeniden saymasın diye varsayılan bu.
 *
 * Ara değerler tam sayıya yuvarlanıyor: kuruş cinsinden tutarlar
 * kesirli kuruş göstermesin.
 *
 * `enabled` kapalıyken hiç çizim yapmaz, değeri olduğu gibi döndürür —
 * sayılmayan her tutarın her değişimde boşuna kare çizmemesi için.
 */
export function useCountUp(
  value: number,
  { duration = DURATION.base, fromZero = false, enabled = true }:
  { duration?: number; fromZero?: boolean; enabled?: boolean } = {},
): number {
  const reduced = useReducedMotion();
  const initial = enabled && fromZero && !reduced ? 0 : value;
  const [shown, setShown] = useState(initial);
  // Yarıda kesilen sayım kaldığı yerden devam etsin diye son gösterilen değer.
  const shownRef = useRef(initial);

  useEffect(() => {
    const show = (n: number) => {
      shownRef.current = n;
      setShown(n);
    };
    if (!enabled) {
      shownRef.current = value;
      return;
    }
    const from = shownRef.current;
    if (reduced || from === value || !Number.isFinite(value)) {
      show(value);
      return;
    }
    const start = Date.now();
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      show(t >= 1 ? value : Math.round(from + (value - from) * easeOutCubic(t)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduced, enabled]);

  return enabled ? shown : value;
}
