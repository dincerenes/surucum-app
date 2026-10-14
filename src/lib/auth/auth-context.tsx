import { FunctionsFetchError, type Session, type User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';

import { wipeLocalUserData } from '@/db/repo';
import { normalizeDisplayName } from '@/lib/profile';
import { getSupabase, isCloudConfigured } from '@/lib/supabase';
import { termsAcceptance } from '@/lib/legal';
import { translateAuthError, validatePassword } from './auth-errors';

/**
 * Oturum durumu.
 *
 * `restoring` ilk açılışta cihazdaki oturumun okunduğu kısa andır. Bu anda
 * yönlendirme yapılmamalı — yoksa oturumu olan kullanıcı bir an giriş
 * ekranını görür ve sonra ana ekrana atlar.
 */
interface AuthState {
  session: Session | null;
  user: User | null;
  restoring: boolean;
  cloudAvailable: boolean;
  /** Şifre sıfırlama bağlantısıyla gelindi; yeni şifre ekranı gösterilmeli. */
  recovery: boolean;
  /**
   * Bağlantıdaki kod oturuma çevrildi, yeni şifre yazılabilir. Çevrilene
   * kadar telefonda kalmış ESKİ bir oturum olabilir; şifre ona yazılırsa
   * başka bir hesabın şifresi değişirdi.
   */
  recoveryReady: boolean;
  recoveryError: string | null;
}

interface AuthActions {
  /** `name` hesabın metadata'sına yazılıyor; ilk kurulumda ayarlara geçer. */
  signUp(email: string, password: string, name?: string): Promise<AuthResult>;
  signIn(email: string, password: string): Promise<AuthResult>;
  /**
   * `wipeDevice`: bu hesabın kayıtlarını cihazdan da siler — ortak ya da
   * elden çıkacak telefon için. Gönderilmemiş kayıtlar da gider; soran
   * ekran bunu önceden söylemeli.
   */
  signOut(options?: { wipeDevice?: boolean }): Promise<void>;
  sendPasswordReset(email: string): Promise<AuthResult>;
  updatePassword(password: string): Promise<AuthResult>;
  cancelRecovery(): void;
  /** Hesabı bulutta ve bu cihazda KALICI olarak siler; ardından oturum kapanır. */
  deleteAccount(): Promise<AuthResult>;
}

export type AuthResult =
  | { ok: true; needsEmailConfirmation?: boolean }
  | { ok: false; error: string };

const CLOUD_UNAVAILABLE: AuthResult = {
  ok: false,
  error: 'Bulut bağlantısı yapılandırılmamış.',
};

const AuthContext = createContext<(AuthState & AuthActions) | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  /**
   * Bulut yoksa geri yüklenecek oturum da yok: `restoring` baştan kapalı.
   * Açık başlasaydı düzenler yükleme göstergesinde sonsuza kadar kalır ve
   * "Uygulama yapılandırılmamış" ekranı hiç görünmezdi.
   */
  const [restoring, setRestoring] = useState(() => getSupabase() != null);
  const [recovery, setRecovery] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  const cloudAvailable = isCloudConfigured();

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    let active = true;

    async function processRecoveryLink(url: string | null) {
      if (!url || !url.startsWith('surucum://sifre-yenile')) return;
      /**
       * `new URL(...).searchParams` React Native'de her sürümde yok;
       * expo-linking'in ayrıştırıcısı her platformda aynı çalışıyor.
       */
      const raw = Linking.parse(url).queryParams?.code;
      const code = typeof raw === 'string' ? raw : null;
      setRecovery(true);
      setRecoveryReady(false);
      setRecoveryError(null);
      if (!code) {
        setRecoveryError('Bağlantı geçersiz. Yeni bir şifre sıfırlama bağlantısı iste.');
        return;
      }
      const { error } = await supabase!.auth.exchangeCodeForSession(code);
      if (error) setRecoveryError(translateAuthError(error));
      else setRecoveryReady(true);
    }

    const linkSubscription = Linking.addEventListener('url', ({ url }) => {
      void processRecoveryLink(url);
    });

    void Promise.all([
      supabase.auth.getSession(),
      Linking.getInitialURL().then(processRecoveryLink),
    ]).then(([{ data }]) => {
      if (!active) return;
      setSession(data.session);
      setRestoring(false);
    }).catch(() => {
      if (active) setRestoring(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') {
        setRecovery(true);
        setRecoveryReady(true);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
      linkSubscription.remove();
    };
  }, []);

  const signUp = useCallback(async (
    email: string, password: string, name?: string,
  ): Promise<AuthResult> => {
    const supabase = getSupabase();
    if (!supabase) return CLOUD_UNAVAILABLE;

    /**
     * Ad hesabın METADATA'sına gidiyor, ayar satırına değil: e-posta
     * doğrulaması istenirse oturum yok ve yerel veritabanına yazacak bir
     * hesap da yok. Kurulum bitince `completeOnboarding` onu ayara taşıyor.
     */
    const displayName = normalizeDisplayName(name);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      // Kullanım koşulları onayı: kayıt ekranı onay kutusu işaretlenmeden
      // buraya gelmiyor; hangi sürümün ne zaman kabul edildiği saklanıyor.
      options: {
        data: {
          ...termsAcceptance(),
          ...(displayName ? { display_name: displayName } : {}),
        },
      },
    });
    if (error) return { ok: false, error: translateAuthError(error) };

    // Oturum boş dönüyorsa proje e-posta doğrulaması istiyor demektir.
    return { ok: true, needsEmailConfirmation: data.session === null };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const supabase = getSupabase();
    if (!supabase) return CLOUD_UNAVAILABLE;

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return { ok: false, error: translateAuthError(error) };
    return { ok: true };
  }, []);

  /**
   * Çıkış kayıtları normalde cihazda BIRAKIR: aynı hesapla dönen sürücü
   * baştan indirmek zorunda kalmasın. İstenirse silme, çıkıştan SONRA —
   * hesap silmedeki sırayla aynı sebepten (bkz. aşağısı).
   */
  const signOut = useCallback(async (options?: { wipeDevice?: boolean }) => {
    const supabase = getSupabase();
    if (!supabase) return;
    const userId = session?.user.id;
    await supabase.auth.signOut();
    if (options?.wipeDevice && userId) wipeLocalUserData(userId);
    setSession(null);
  }, [session]);

  /**
   * Hesap silme — mağazaların istediği uygulama içi silme.
   *
   * Sıra önemli: ÖNCE bulut. Silme orada başarısız olursa cihazdaki
   * veriye dokunulmuyor; sürücü hesabını da verisini de kaybetmeden
   * tekrar deneyebilir.
   *
   * Bulut sildikten sonra ÖNCE çıkış, SONRA yerel temizlik: çıkış senkron
   * bekçisini düşürüyor (bkz. `sync/guard.ts`). Tersi olsaydı o an süren
   * bir tur, temizlenen hesabın hata kaydını ve imlecini geri yazabilirdi.
   * Çıkışın hatası önemsiz — kullanıcı artık yok, oturum yine de siliniyor.
   */
  const deleteAccount = useCallback(async (): Promise<AuthResult> => {
    const supabase = getSupabase();
    if (!supabase) return CLOUD_UNAVAILABLE;
    const userId = session?.user.id;
    if (!userId) return { ok: false, error: 'Oturumun sona erdi. Tekrar giriş yap.' };

    const failed: AuthResult = { ok: false, error: 'Hesap silinemedi, biraz sonra tekrar dene.' };
    let deleted = false;
    let offline = false;
    try {
      const { data, error } = await supabase.functions.invoke<{ ok?: boolean }>(
        'delete-account', { method: 'POST' },
      );
      deleted = !error && data?.ok === true;
      offline = error instanceof FunctionsFetchError;
    } catch {
      // Aşağıda hesabın durumuna bakılıyor.
    }

    /**
     * Yanıt gelmedi diye silme olmadı sayılmıyor: bulut hesabı silip
     * yanıt yolda kaybolabiliyor. O zaman "silinemedi" deyip kayıtları
     * cihazda bırakmak, var olmayan bir hesabın verisini telefonda
     * unutmak olurdu. Hesap gerçekten yoksa temizliğe devam ediliyor.
     */
    if (!deleted) deleted = await isAccountGone(supabase);
    if (!deleted) {
      return offline ? { ok: false, error: 'İnternet bağlantısı yok, hesabın silinmedi.' } : failed;
    }

    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    wipeLocalUserData(userId);
    setSession(null);
    return { ok: true };
  }, [session]);

  const sendPasswordReset = useCallback(async (email: string): Promise<AuthResult> => {
    const supabase = getSupabase();
    if (!supabase) return CLOUD_UNAVAILABLE;

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'surucum://sifre-yenile',
    });
    if (error) return { ok: false, error: translateAuthError(error) };
    return { ok: true };
  }, []);

  const updatePassword = useCallback(async (password: string): Promise<AuthResult> => {
    const supabase = getSupabase();
    if (!supabase) return CLOUD_UNAVAILABLE;
    if (!recovery || !recoveryReady) {
      return { ok: false, error: 'Şifre sıfırlama bağlantısı gerekli.' };
    }
    const problem = validatePassword(password);
    if (problem) return { ok: false, error: problem };
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { ok: false, error: translateAuthError(error) };
    setRecovery(false);
    setRecoveryReady(false);
    setRecoveryError(null);
    return { ok: true };
  }, [recovery, recoveryReady]);

  const cancelRecovery = useCallback(() => {
    setRecovery(false);
    setRecoveryReady(false);
    setRecoveryError(null);
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      restoring,
      cloudAvailable,
      recovery,
      recoveryReady,
      recoveryError,
      signUp,
      signIn,
      signOut,
      sendPasswordReset,
      updatePassword,
      cancelRecovery,
      deleteAccount,
    }),
    [
      session, restoring, cloudAvailable, recovery, recoveryReady, recoveryError,
      signUp, signIn, signOut, sendPasswordReset, updatePassword, cancelRecovery,
      deleteAccount,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth, AuthProvider içinde kullanılmalı');
  return ctx;
}

/**
 * Hesap bulutta artık yok mu? Yalnızca sunucu bunu AÇIKÇA söylerse
 * `true` — bağlantı hatası, süresi dolmuş oturum ya da başka her yanıt
 * "bilinmiyor" sayılıyor ve hiçbir şey silinmiyor.
 */
async function isAccountGone(supabase: NonNullable<ReturnType<typeof getSupabase>>): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.getUser();
    return !data.user && error?.code === 'user_not_found';
  } catch {
    return false;
  }
}
