import { router } from 'expo-router';
import { useState } from 'react';

import { SetupStep } from '@/components/setup-step';
import { Field, SelectField } from '@/components/ui';
import { getSettings, updateSettings } from '@/db/repo';
import { useAuth } from '@/lib/auth/auth-context';
import { CITIES } from '@/lib/cities';
import { MAX_DISPLAY_NAME } from '@/lib/profile';
import { getSupabase } from '@/lib/supabase';
import { requestSync } from '@/sync/scheduler';

/**
 * Kurulum 1 — kişisel bilgiler: ad ve çalışılan şehir.
 *
 * İKİSİ DE İSTEĞE BAĞLI: ad yalnızca selamlamada, şehir yalnızca
 * Pusula'nın yoğun saatlerinde kullanılıyor; boş bırakan sürücü de
 * devam edebilir, ikisi de Profil'den sonradan girilir.
 *
 * Araç sorularından farklı olarak bu adım HEMEN kaydediliyor: ad ve
 * şehir araçtan bağımsız ve sürücü kurulumu yarıda bıraksa bile
 * bir daha sorulmasın.
 *
 * Kayıtta ad yazıldıysa (hesabın metadata'sı) alan dolu geliyor.
 */
export default function InfoStep() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [initial] = useState(() => {
    const settings = userId ? getSettings(userId) : undefined;
    const signupName = user?.user_metadata?.display_name;
    return {
      name: settings?.displayName ?? (typeof signupName === 'string' ? signupName : ''),
      city: settings?.city ?? null,
    };
  });
  const [name, setName] = useState(initial.name);
  const [city, setCity] = useState<string | null>(initial.city);

  function devam() {
    if (!userId) return;
    updateSettings(userId, { displayName: name, city });
    // Ad artık ayarda; hesabın metadata'sındaki kopya silinsin. İki yerde
    // tutulursa Profil'den değiştirilen adın eski hali hesapta kalır.
    // Beklenmiyor ve hata yutuluyor: çevrimdışı olabilir, kurulum akışını
    // tutmamalı. Yalnızca metadata'da ad varsa istek atılıyor.
    if (typeof user?.user_metadata?.display_name === 'string') {
      void getSupabase()?.auth.updateUser({ data: { display_name: null } }).catch(() => {});
    }
    requestSync();
    router.push('/arac');
  }

  return (
    <SetupStep
      step={1}
      title="Seni tanıyalım"
      subtitle="Anasayfada seni adınla karşılarız. Şehrini seçersen Pusula o şehrin yoğun saatlerini gösterir."
      primary={{ label: 'Kaydet ve devam et', onPress: devam }}
    >
      <Field
        label="Adın (isteğe bağlı)"
        value={name}
        onChangeText={setName}
        placeholder="Örn. Enes"
        autoCapitalize="words"
        autoComplete="name"
        textContentType="givenName"
        maxLength={MAX_DISPLAY_NAME}
      />
      <SelectField
        label="Çalıştığın şehir (isteğe bağlı)"
        value={city}
        onChange={setCity}
        options={CITIES}
        placeholder="Şehrini seç"
        searchable
      />
    </SetupStep>
  );
}
