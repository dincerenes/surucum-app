/**
 * Kurulumun son adımı — "Başla".
 *
 * Sihirbazın taslağından aracı yazıyor, onu seçili araç yapıyor ve
 * kurulumu damgalıyor. Ekrandan ayrı, çünkü çift araç hatasının asıl
 * kapısı burası ve test edilebilmeli.
 */

import type { Vehicle } from '../schema/vehicles';
import { type UnixMs } from './_base';
import { completeOnboarding, updateSettings } from './settings';
import { createVehicle, listActiveVehicles } from './vehicles';
import { type SetupDraft, draftLabel, draftWearInputs } from '@/lib/setup-answers';
import { parseWholeKm } from '@/lib/whole-number';

/**
 * Aracı yazar ve kurulumu bitirir.
 *
 * Hesapta zaten aktif araç varsa (kurulum ekranı açıkken buluttan indiyse)
 * YENİSİ AÇILMAZ, `null` döner: aynı aracın ikinci kez eklenmesi tam da
 * bu yoldan oluyordu. Kurulum yine de damgalanır — sürücü takılı kalmasın.
 */
export function finishSetup(
  userId: string, draft: SetupDraft, signupName: string | null, now: UnixMs = Date.now(),
): Vehicle | null {
  let vehicle: Vehicle | null = null;

  if (listActiveVehicles(userId).length === 0) {
    vehicle = createVehicle(userId, {
      label: draftLabel(draft),
      ownership: 'owned',
      fuelTypes: draft.fuels,
      make: draft.make,
      model: draft.model,
      modelYear: draft.year ? Number(draft.year) : null,
      initialOdometerKm: parseWholeKm(draft.odometer),
      transmission: draft.transmission,
      ...draftWearInputs(draft),
    }, now);
    updateSettings(userId, { defaultVehicleId: vehicle.id }, now);
  }

  completeOnboarding(userId, signupName, now);
  return vehicle;
}
