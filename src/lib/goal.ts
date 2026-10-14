/**
 * Hedef ilerlemesi.
 *
 * HEDEF CİROYA DEĞİL CEBE KALANA konur. Ciroya hedef koymak, yakıtı ve
 * komisyonu görmezden sayan bir başarı ölçüsü yaratır: sürücü hedefi
 * tutturur, cebine bir şey girmez ve sayıya bir daha inanmaz.
 *
 * Gerçek kâr da hedef paydası DEĞİLDİR: içinde yıpranma payı var ve o
 * pay kilometre girilene kadar bilinmiyor. Gün ortasında hedefi yıpranma
 * payına bağlamak, sürücünün gün boyu oynayan bir çubuğa bakması demek.
 */

import { type Kurus, ZERO } from './money.ts';

export interface GoalProgress {
  /** Hedef tutar. */
  target: Kurus;
  /** Şu ana kadar cebe kalan. Negatif olabilir. */
  current: Kurus;
  /**
   * Doluluk oranı, 0–1 arası. Hedefi aşınca 1'de durur — çubuk taşmaz,
   * aşma bilgisi `remaining` üzerinden okunur.
   */
  ratio: number;
  /** Hedefe kalan. Hedef aşıldıysa sıfır. */
  remaining: Kurus;
  /** Hedef aşıldı mı? */
  reached: boolean;
}

/**
 * Hedefe ne kadar yaklaşıldığını hesaplar.
 *
 * NEGATİF GÜN SIFIR DOLULUK gösterir, negatif çubuk değil: zarar edilen
 * bir günde "−%30 doluluk" diye bir şey yok, hedefe hiç yaklaşılmamıştır.
 * Zararın kendisi üç satırda zaten kırmızı duruyor.
 */
export function calculateGoalProgress(
  target: Kurus | null | undefined,
  current: Kurus,
): GoalProgress | null {
  if (target == null || !Number.isFinite(target) || target <= 0) return null;

  const reached = current >= target;
  const remaining = reached ? ZERO : ((target - current) as Kurus);
  const ratio = current <= 0 ? 0 : Math.min(1, current / target);

  return { target, current, ratio, remaining, reached };
}
