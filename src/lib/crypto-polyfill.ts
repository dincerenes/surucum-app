/**
 * KRİTİK — bu dosya, uuid kullanan HERHANGİ bir koddan ÖNCE çalışmalıdır.
 * Uygulama giriş dosyasının (src/app/_layout.tsx) en üstünde import edilir.
 *
 * Hermes `globalThis.crypto.getRandomValues` sağlamıyor ve `expo` paketi de
 * bunu polyfill etmiyor. uuid'in rastgele sayı üreteci bu globali kullandığı
 * için, polyfill olmadan ilk kimlik üretiminde
 * `crypto.getRandomValues is not a function` ile patlar.
 *
 * expo-crypto tercih edildi çünkü Expo Go'da hazır geliyor; bare native
 * modül gerektirmiyor.
 */
import { getRandomValues } from 'expo-crypto';

type MutableCrypto = { getRandomValues?: typeof getRandomValues };

const globalRef = globalThis as unknown as { crypto?: MutableCrypto };

if (typeof globalRef.crypto === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', {
    value: {},
    configurable: true,
    writable: true,
  });
}

if (typeof globalRef.crypto?.getRandomValues !== 'function') {
  Object.defineProperty(globalRef.crypto as object, 'getRandomValues', {
    value: getRandomValues,
    configurable: true,
    writable: true,
  });
}

export {};
