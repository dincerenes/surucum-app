/**
 * Kurulum sihirbazının cevapları — React'siz kısım.
 *
 * Taslağın tipi ve cevaplardan araca giden dönüşümler burada; bellekteki
 * taslağı tutan sağlayıcı `setup-draft.tsx`'te. Ayrı dosya, çünkü
 * kurulumu bitiren repo fonksiyonu (`finishSetup`) ve testleri React
 * yüklemeden bu dönüşümleri kullanıyor.
 *
 * Girdiler ham metin olarak tutuluyor — sürücü geri dönünce yazdığını
 * yazdığı gibi görsün.
 */

import type { FuelType, TransmissionType } from '@/db/schema/_shared';
import { type Kurus, parseAmount } from '@/lib/money';
import { parseWholeKm } from '@/lib/whole-number';

export interface SetupDraft {
  make: string | null;
  model: string | null;
  year: string | null;
  fuels: FuelType[];
  transmission: TransmissionType | null;
  maintenanceKm: string;
  maintenanceCost: string;
  tireKm: string;
  tireCost: string;
  marketValue: string;
  odometer: string;
}

export const INITIAL_SETUP_DRAFT: SetupDraft = {
  make: null, model: null, year: null,
  fuels: ['gasoline'], transmission: null,
  maintenanceKm: '', maintenanceCost: '',
  tireKm: '', tireCost: '',
  marketValue: '', odometer: '',
};

/** Aracın adı: "Fiat Egea 2023". "Diğer" seçimleri ada girmiyor. */
export function draftLabel(d: Pick<SetupDraft, 'make' | 'model' | 'year'>): string {
  return [d.make, d.model, d.year].filter((p) => p && p !== 'Diğer').join(' ') || 'Aracım';
}

export interface DraftWearInputs {
  maintenanceIntervalKm: number | null;
  maintenanceCostKurus: Kurus | null;
  tireIntervalKm: number | null;
  tireCostKurus: Kurus | null;
  marketValueKurus: Kurus | null;
}

/** Taslağın yıpranma girdileri — boş ya da okunamayan alan `null`. */
export function draftWearInputs(d: SetupDraft): DraftWearInputs {
  return {
    maintenanceIntervalKm: parseWholeKm(d.maintenanceKm),
    maintenanceCostKurus: d.maintenanceCost ? parseAmount(d.maintenanceCost) : null,
    tireIntervalKm: parseWholeKm(d.tireKm),
    tireCostKurus: d.tireCost ? parseAmount(d.tireCost) : null,
    marketValueKurus: d.marketValue ? parseAmount(d.marketValue) : null,
  };
}
