import { Chip, ChipRow } from './chip';
import { PERIOD_KEYS, PERIOD_LABELS, type PeriodKey } from '@/lib/period';

/**
 * Dönem filtresi — Kayıtlar ve İstatistik'in üstünde, yatay kayan çipler.
 *
 * İki ekran aynı çubuğu ve aynı dönem sınırlarını (`period.ts`) kullanıyor:
 * "Bu ay" iki ekranda farklı günleri kapsasaydı sürücü iki farklı ciro
 * görürdü.
 */
export function PeriodFilterBar({
  value, onChange,
}: { value: PeriodKey; onChange: (next: PeriodKey) => void }) {
  return (
    <ChipRow>
      {PERIOD_KEYS.map((p) => (
        <Chip key={p} label={PERIOD_LABELS[p]} selected={value === p} onPress={() => onChange(p)} />
      ))}
    </ChipRow>
  );
}
