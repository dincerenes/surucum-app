import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { getCutoffHour } from '@/db/repo';
import {
  type BusinessDate, DEFAULT_CUTOFF_HOUR, nextBusinessDateChange, todayBusinessDate,
} from '@/lib/business-date';

/**
 * Bugünün iş günü — gün dönünce kendiliğinden değişir.
 *
 * Ekranlar "bugün"ü `useDbValue` içinde hesaplıyordu; o da yalnızca
 * açılışta ve kayıt yazılınca yeniden okuyor. Saatin ilerlemesi ikisini de
 * tetiklemiyor: gece arka planda bırakılan uygulama 1 Kasım sabahı açılınca,
 * sürücü bir kayıt girene kadar Anasayfa "31 EKİM" yazıyor, aylık kart
 * Ekim'i gösteriyordu. Bu değer `useDbValue`'ya bağımlılık olarak verilir;
 * değiştiğinde ekran yeni günle yeniden okur.
 *
 * İki yerden bakılıyor:
 *  - Gün dönümüne kurulan TEK zamanlayıcı (saniyede bir bakmıyoruz).
 *  - Uygulama öne geldiğinde: iOS arka plandaki zamanlayıcıyı askıya
 *    alıyor, gece boyunca kapalı kalan telefonda zamanlayıcıya güvenilmez.
 *
 * Kesme saati ekranların kullandığı `getCutoffHour` ile aynı — ikisi
 * ayrışırsa başlıktaki tarih ile sayıların günü farklı olur.
 */
export function useBusinessToday(userId: string | null): BusinessDate {
  const cutoff = userId ? getCutoffHour(userId) : DEFAULT_CUTOFF_HOUR;
  const [today, setToday] = useState(() => todayBusinessDate(cutoff));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const check = () => {
      const now = new Date();
      // Aynı gün dönerse React yeniden çizmiyor (aynı metin).
      setToday(todayBusinessDate(cutoff, now));
      if (timer) clearTimeout(timer);
      /**
       * Bir saniye pay: zamanlayıcı birkaç milisaniye erken düşerse eski
       * günü okuyup boşuna bir tur daha kurmasın.
       */
      const delay = Math.max(nextBusinessDateChange(now, cutoff) - now.getTime(), 0) + 1000;
      timer = setTimeout(check, delay);
    };

    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, [cutoff]);

  return today;
}
