/**
 * Hesabımı sil — mağazaların uygulama içinde istediği hesap silme.
 *
 * Çağıran YALNIZCA KENDİ hesabını silebilir: kimlik istek gövdesinden
 * değil, Authorization başlığındaki oturum jetonundan çözülüyor. Silme
 * yönetici istemcisiyle (service role) yapılıyor; o anahtar yalnızca
 * burada, sunucuda duruyor ve uygulamaya hiç inmiyor.
 *
 * VERİ SİLME — ayrıca bir şey yapılmıyor, çünkü gerek yok. Kullanıcı
 * tablolarının hepsi `auth.users(id)`'ye `on delete cascade` ile bağlı
 * (supabase/migrations/*.sql tarandı): app_settings, vehicles,
 * vehicle_fuel_types, earning_sources, expense_categories, shifts, rides,
 * expenses, recurring_expenses, fuel_logs, goals, feedback, terms_acceptances,
 * admin_users. Kullanıcı tabloları arasında yabancı anahtar yok; zincir tek
 * adım.
 *
 * SİLME KANITI — KVKK Silme Yönetmeliği md. 7 silme işleminin kaydını ve
 * en az 3 yıl saklanmasını istiyor. deleteUser BAŞARILI olunca
 * `account_deletions` tablosuna (yabancı anahtarsız; yalnızca hesap
 * kimliği, zaman, yöntem, sonuç — e-posta YOK) bir satır yazılıyor. Kanıt
 * yazılamazsa silme yine BAŞARILI sayılıyor: hesap gitti, kullanıcıya
 * "başarısız" demek onu tekrar denemeye ve olmayan bir hesapla uğraşmaya
 * iterdi. Hata günlüğe hesap kimliğiyle düşüyor; kanıt oradan elle
 * eklenir (bkz. supabase/migrations/20261003093530_account_deletions.sql).
 *
 * Cascade OLMAYANLAR — hepsi `on delete set null`, bilinçli olarak
 * dokunulmuyor: admin_users.created_by, admin_audit_log.admin_id,
 * announcements.created_by, feature_flags.updated_by. Bunlar sürücü verisi
 * değil, yönetim kayıtları; silinen yönetici "bilinmeyen" olarak kalır.
 * `account_deletions.user_id`'de bilerek hiç yabancı anahtar yok (silme
 * kanıtı hesaptan sonra yaşamalı). `fuel_prices` kimseye ait değil. Yeni
 * bir kullanıcı tablosu eklenirse cascade'le eklenmeli — yoksa satırları
 * burada silinmeden kalır.
 *
 * Yayına alma: `supabase functions deploy delete-account`
 * verify_jwt varsayılan (açık) bırakılıyor: geçidi oturumsuz istek zaten
 * geçemiyor. Kimlik yine de aşağıda ayrıca doğrulanıyor.
 *
 * Jeton ve e-posta ASLA günlüğe yazılmaz; hata günlüğünde yalnızca mesaj
 * (kanıt hatasında ayrıca hesap kimliği) var.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) {
    console.error('delete-account: ortam değişkenleri eksik');
    return json({ ok: false, error: 'server_misconfigured' }, 500);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ ok: false, error: 'unauthorized' }, 401);

  // Kullanıcı, çağıranın kendi jetonuyla çözülüyor — başkasının kimliği
  // gövdede gönderilse bile hiçbir etkisi yok.
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return json({ ok: false, error: 'unauthorized' }, 401);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error('delete-account: silme başarısız', deleteError.message);
    return json({ ok: false, error: 'delete_failed' }, 500);
  }

  // Silme kanıtı. Başarısızlığı silmenin sonucunu DEĞİŞTİRMİYOR.
  try {
    const { error: proofError } = await admin
      .from('account_deletions')
      .insert({ user_id: user.id, method: 'in_app', result: 'completed' });
    if (proofError) {
      console.error(
        'delete-account: silme kanıtı yazılamadı', user.id, proofError.code, proofError.message,
      );
    }
  } catch (e) {
    console.error(
      'delete-account: silme kanıtı yazılamadı', user.id, e instanceof Error ? e.message : String(e),
    );
  }

  return json({ ok: true }, 200);
});
