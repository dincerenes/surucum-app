/**
 * Kurulum sihirbazının taslağı — adımlar arasında taşınan cevaplar.
 *
 * Araç YALNIZCA SON ADIMDA yazılıyor (`finishSetup`): yarıda bırakılan
 * kurulum yarım bir araç bırakmasın (eksik araç "araç var" sayılır ve
 * kurulum bir daha açılmaz).
 *
 * Taslak bellekte: uygulama kapanırsa araç soruları baştan sorulur.
 * Kişisel bilgiler (ilk adım) ise hemen ayarlara yazılıyor.
 */

import { type ReactNode, createContext, useContext, useMemo, useState } from 'react';

import { INITIAL_SETUP_DRAFT, type SetupDraft } from '@/lib/setup-answers';

export {
  type DraftWearInputs, type SetupDraft, draftLabel, draftWearInputs,
} from '@/lib/setup-answers';

interface Ctx {
  draft: SetupDraft;
  update: (patch: Partial<SetupDraft>) => void;
}

const SetupDraftContext = createContext<Ctx | null>(null);

export function SetupDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<SetupDraft>(INITIAL_SETUP_DRAFT);
  const value = useMemo<Ctx>(() => ({
    draft,
    update: (patch) => setDraft((cur) => ({ ...cur, ...patch })),
  }), [draft]);
  return <SetupDraftContext.Provider value={value}>{children}</SetupDraftContext.Provider>;
}

export function useSetupDraft(): Ctx {
  const ctx = useContext(SetupDraftContext);
  if (!ctx) throw new Error('useSetupDraft, SetupDraftProvider içinde kullanılmalı');
  return ctx;
}
