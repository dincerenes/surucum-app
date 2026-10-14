/**
 * Supabase hata mesajlarını Türkçeye çevirir.
 *
 * Supabase her zaman İngilizce döner ve mesajları sürüm arası değişebilir.
 * Bu yüzden önce KODA bakılır (kararlı), kod tanınmazsa mesaj metnine
 * düşülür (kırılgan ama kapsayıcı). Hiçbiri tutmazsa genel bir mesaj
 * gösterilir — ham İngilizce metin asla kullanıcıya çıkmaz.
 */

interface MaybeAuthError {
  code?: string;
  status?: number;
  message?: string;
  name?: string;
}

const RESET_LINK_INVALID =
  'Bu bağlantı artık geçerli değil. Bağlantıyı istediğin telefonda aç ya da yeni bir bağlantı iste.';

const BY_CODE: Record<string, string> = {
  invalid_credentials: 'E-posta veya şifre hatalı.',
  email_not_confirmed: 'E-posta adresini doğrulaman gerekiyor. Gelen kutunu kontrol et.',
  user_already_exists: 'Bu e-posta adresi zaten kayıtlı. Giriş yapmayı dene.',
  email_exists: 'Bu e-posta adresi zaten kayıtlı. Giriş yapmayı dene.',
  weak_password: 'Şifre çok zayıf. En az 8 karakter kullan.',
  over_request_rate_limit: 'Çok fazla deneme yaptın. Birkaç dakika bekleyip tekrar dene.',
  over_email_send_rate_limit: 'Çok fazla e-posta gönderildi. Biraz bekleyip tekrar dene.',
  validation_failed: 'Girdiğin bilgiler geçersiz.',
  // Supabase teslim edilemeyecek alan adlarını reddeder (örn. uydurma domainler).
  email_address_invalid: 'Bu e-posta adresi kabul edilmedi. Gerçek ve kullandığın bir adres gir.',
  email_address_not_authorized: 'Bu e-posta adresine gönderim yapılamıyor.',
  same_password: 'Yeni şifre eskisiyle aynı olamaz.',
  user_not_found: 'Bu e-posta ile kayıtlı bir hesap bulunamadı.',
  session_expired: 'Oturumun sona erdi. Tekrar giriş yap.',
  signup_disabled: 'Şu anda yeni kayıt alınmıyor.',
  // Şifre sıfırlama bağlantısı: süresi dolmuş, bir kez kullanılmış ya da
  // başka bir telefonda istenmiş (kod doğrulayıcısı istendiği cihazda duruyor).
  flow_state_not_found: RESET_LINK_INVALID,
  flow_state_expired: RESET_LINK_INVALID,
  otp_expired: RESET_LINK_INVALID,
  bad_code_verifier: RESET_LINK_INVALID,
};

const BY_MESSAGE: [RegExp, string][] = [
  [/invalid login credentials/i, 'E-posta veya şifre hatalı.'],
  [/email not confirmed/i, 'E-posta adresini doğrulaman gerekiyor. Gelen kutunu kontrol et.'],
  [/user already registered/i, 'Bu e-posta adresi zaten kayıtlı. Giriş yapmayı dene.'],
  [/password should be at least (\d+)/i, 'Şifre çok kısa. En az 8 karakter kullan.'],
  [/unable to validate email address/i, 'E-posta adresi geçersiz görünüyor.'],
  [/invalid email/i, 'E-posta adresi geçersiz görünüyor.'],
  [/email address .* is invalid/i,
   'Bu e-posta adresi kabul edilmedi. Gerçek ve kullandığın bir adres gir.'],
  [/email rate limit exceeded/i,
   'E-posta gönderim sınırına ulaşıldı. Bir saat sonra tekrar dene.'],
  [/for security purposes|rate limit|too many requests/i,
   'Çok fazla deneme yaptın. Birkaç dakika bekleyip tekrar dene.'],
  [/network request failed|fetch failed|network error/i,
   'İnternet bağlantısı kurulamadı. Bağlantını kontrol et.'],
  [/token has expired|jwt expired/i, 'Oturumun sona erdi. Tekrar giriş yap.'],
  [/code verifier|flow state/i, RESET_LINK_INVALID],
];

export function translateAuthError(error: unknown): string {
  if (!error) return 'Beklenmeyen bir hata oluştu.';

  const e = error as MaybeAuthError;

  if (e.code && BY_CODE[e.code]) return BY_CODE[e.code];

  const message = typeof e.message === 'string' ? e.message : '';
  for (const [pattern, translation] of BY_MESSAGE) {
    if (pattern.test(message)) return translation;
  }

  // Ağ katmanı hataları genelde TypeError olarak gelir.
  if (e.name === 'TypeError' || e.name === 'AuthRetryableFetchError') {
    return 'İnternet bağlantısı kurulamadı. Bağlantını kontrol et.';
  }

  if (e.status === 429) {
    return 'Çok fazla deneme yaptın. Birkaç dakika bekleyip tekrar dene.';
  }

  return 'Bir şeyler ters gitti. Lütfen tekrar dene.';
}

// ---------------------------------------------------------------------------
// Girdi doğrulama — sunucuya gitmeden önce
// ---------------------------------------------------------------------------

export function validateEmail(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'E-posta adresi gerekli.';
  // Kasıtlı olarak gevşek: aşırı katı desenler geçerli adresleri reddediyor.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
    return 'E-posta adresi geçersiz görünüyor.';
  }
  return null;
}

export const MIN_PASSWORD_LENGTH = 8;

export function validatePassword(value: string): string | null {
  if (!value) return 'Şifre gerekli.';
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalı.`;
  }
  return null;
}
