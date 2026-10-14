import { router } from 'expo-router';

import { SetupStep } from '@/components/setup-step';
import { AmountInput } from '@/components/ui';
import { finishSetup } from '@/db/repo';
import { useAuth } from '@/lib/auth/auth-context';
import { parseAmount } from '@/lib/money';
import type { SetupDraft } from '@/lib/setup-answers';
import { useSetupDraft } from '@/lib/setup-draft';
import { requestSync } from '@/sync/scheduler';

/**
 * Kurulum 6, SON adım — aracın bugünkü durumu: ikinci el değeri ve
 * kilometresi. "Başla" kurulumu burada bitiriyor.
 *
 * Değer kaybı payı ikinci el değerden çıkıyor. Kilometre ilk yakıt
 * hesabının başlangıcı. Hasar kaydı artık SORULMUYOR: hesaba hiç
 * girmiyordu (değer zaten onu yansıtıyor), sürücüden kullanılmayan bir
 * veri istemek de gereksizdi. Veritabanındaki sütun duruyor, yazılmıyor.
 *
 * Eskiden ardından bir özet sayfası yıpranma payını kalem kalem
 * gösteriyordu. Sürücü kurulumun sonunda bir katsayıyla karşılaşmak
 * istemedi (2 Ekim 2026); pay sessizce hesaplanıyor, Araçlarım'da
 * görülüyor.
 *
 * Araç BURADA yazılıyor — önceki adımlar yalnızca taslağı dolduruyor.
 */
export default function ValueStep() {
  const { user } = useAuth();
  const { draft, update } = useSetupDraft();

  const value = draft.marketValue.trim() === '' ? null : parseAmount(draft.marketValue);
  const valid = value != null && value > 0;

  /**
   * Taslak açıkça veriliyor: "atla" alanı boşaltıp hemen bitiriyor ve
   * `update` bu çizimde henüz yansımamış oluyor.
   */
  function basla(final: SetupDraft) {
    if (!user?.id) return;
    // Kayıt adı İLK adımda ayara taşındı (sürücü orada boş da bırakabilir);
    // burada tekrar kopyalanırsa bilerek silinen ad geri gelir.
    finishSetup(user.id, final, null);
    requestSync();
    router.replace('/');
  }

  return (
    <SetupStep
      step={6}
      title="Aracın bugünkü durumu"
      subtitle="Değer kaybını hesaplamak için aracının şu anki ikinci el değerini soruyoruz."
      primary={{ label: 'Başla', onPress: () => basla(draft), disabled: !valid }}
      skip={{
        label: 'Değerini bilmiyorum, atla',
        onPress: () => basla({ ...draft, marketValue: '' }),
      }}
    >
      <AmountInput
        label="İkinci el değeri"
        value={draft.marketValue}
        onChangeText={(marketValue) => update({ marketValue })}
        unit="₺"
        hint="İlan sitelerindeki benzer araçların fiyatı yeterli."
      />
      <AmountInput
        label="Güncel kilometre"
        value={draft.odometer}
        onChangeText={(odometer) => update({ odometer })}
        unit="km"
        keyboard="number-pad"
        hint="Zorunlu değil."
      />
    </SetupStep>
  );
}
