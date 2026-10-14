import { useEffect, useState } from 'react';

/**
 * Şimdiki zaman, `intervalMs`'de bir yenilenir.
 *
 * Veritabanı değişmeden değişen şeyler için: selamlama saati, açık
 * vardiyanın süresi, "unutulmuş vardiya" eşiği. `useDriver` yalnızca
 * kayıt değişince yeniden okuyor; saat ise kendi kendine ilerliyor.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
