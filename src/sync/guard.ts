/**
 * Tur bekçisi — oturum tur ortasında değişirse turu durdurur.
 *
 * Bir senkron turu birçok ağ isteği bekliyor. O sırada sürücü çıkış
 * yapabilir ya da aynı cihazda başka hesapla girebilir. Tur devam etseydi
 * A'nın kayıtları B'nin jetonuyla gönderilir (RLS reddeder, A'nın kaydı
 * boşuna "başarısız" sayılır), B'nin jetonuyla A için çekme yapılır (boş
 * döner, A'nın imleci ve kurtarma defteri yanlış sonuca varır).
 *
 * Bu yüzden her ağ isteğinden ÖNCE ve her beklemeden SONRA, yerele bir
 * şey yazmadan önce bekçi çağrılır. Oturum değiştiyse
 * `SessionChangedError` fırlatılır; tur hiçbir durum yazmadan biter,
 * askıdaki gönderim onaylanmaz ve kayıt bir sonraki turda yeniden gider
 * (sunucu bayat yazmayı reddettiği için tekrar göndermek zararsız).
 */

export class SessionChangedError extends Error {
  constructor() {
    super('Oturum tur sırasında değişti');
    this.name = 'SessionChangedError';
  }
}

/**
 * Hata oturum değişiminden mi? Ada da bakılıyor: derlenmiş sınıf
 * dönüşümlerinde `Error`'dan türeyen sınıfın `instanceof`'u güvenilir
 * olmayabiliyor ve kaçan bir durdurma, kaydı boşuna "başarısız" sayardı.
 */
export function isSessionChanged(error: unknown): boolean {
  return error instanceof SessionChangedError
    || (error instanceof Error && error.name === 'SessionChangedError');
}

/** Oturum hâlâ turun başladığı hesaba aitse sessiz döner, değilse fırlatır. */
export type SyncGuard = () => void;

export const NO_GUARD: SyncGuard = () => {};

/** `isCurrent` false dönmeye başladığı anda fırlatan bekçi. */
export function guardFrom(isCurrent: () => boolean): SyncGuard {
  return () => {
    if (!isCurrent()) throw new SessionChangedError();
  };
}
