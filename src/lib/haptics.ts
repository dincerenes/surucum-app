/**
 * Dokunsal geri bildirim — uygulamanın her yerinde aynı dört his.
 *
 * Sürücü çoğu zaman ekrana bakmadan basıyor; titreşim "kaydedildi"
 * demenin gözü yola bağlı kalan tek yolu. Bu yüzden azı çok: her
 * dokunuşta titreyen telefon, önemli anı da sıradanlaştırır.
 *
 * - `tap`: seçim, ince tık — sihirbaz adımı, çip
 * - `press`: ana eylem — Yolcu ekle, Vardiya başlat, Kaydet
 * - `success`: ödül anı — hedef tamam, vardiya kapandı
 * - `warning`: zararla kapanan gün
 *
 * Hatalar yutuluyor: titreşimi olmayan cihazda (simülatör, eski Android)
 * kayıt akışı bir titreşim yüzünden düşmemeli.
 */

import * as Haptics from 'expo-haptics';

function quiet(p: Promise<void>): void {
  p.catch(() => {});
}

export const haptic = {
  tap: () => quiet(Haptics.selectionAsync()),
  press: () => quiet(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  success: () => quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
} as const;
