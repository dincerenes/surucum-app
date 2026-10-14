/**
 * Çekme imleci.
 *
 * Ayrı modülde çünkü senkronun EN TEHLİKELİ kararı burada: imleci olması
 * gerekenden ileri taşımak, aradaki kayıtların bir daha hiç istenmemesi
 * demektir. Veri sessizce kaybolur ve kimse fark etmez. Bu yüzden kural
 * veritabanından ve ağdan bağımsız, test edilebilir.
 *
 * İMLEÇ TEK BİR DAMGA DEĞİL, (damga, kimlik) ÇİFTİDİR. Sebebi sunucunun
 * kendisi: `server_updated_at` işlem başına bir kez alınıyor, yani tek
 * upsert isteğiyle giden 400 satırın damgası BİREBİR AYNI. Damga tek
 * başına imleç olsaydı, sayfa sınırı böyle bir grubun ortasına düştüğünde
 * geri kalanı `>` süzgecinin dışında kalır ve hiç inmezdi.
 *
 * Damga METİN olarak taşınır — sunucunun döndürdüğü hâliyle. Mikrosaniye
 * taşıyor ve `Date` milisaniyeye yuvarlıyor; yuvarlanmış bir imleç aynı
 * milisaniyedeki kayıtları atlatır.
 */

/** Bir tablonun nereye kadar indiği. */
export interface PullKey {
  /** `server_updated_at` — sunucudan geldiği gibi, HAM metin. */
  ts: string;
  /** Aynı damgayı taşıyan satırlar arasında sıra: son inen kimlik. */
  id: string;
}

/** Hiç çekilmemiş tablo: her şey baştan iner (cihaz değiştirme senaryosu). */
export const PULL_START: PullKey = {
  ts: '1970-01-01T00:00:00+00:00',
  id: '00000000-0000-0000-0000-000000000000',
};

const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:?\d{0,2})$/;

/**
 * Damgayı mikrosaniyeye çevirir; çözümlenemezse `null`.
 *
 * `Date.parse` KULLANILMIYOR: milisaniyeden küçüğünü atıyor ve
 * `...123100+00:00` ile `...123900+00:00` aynı sayıya iniyor. İki damga
 * eşit görünürse sıralama ve imleç kararları yanlış çıkar.
 *
 * Mikrosaniye tam sayı olarak 2255 yılına kadar güvenli sığıyor;
 * BigInt'e gerek yok.
 */
export function tsMicros(ts: string): number | null {
  const m = TIMESTAMP.exec(ts);
  if (!m) return null;

  const millis = Date.UTC(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4]), Number(m[5]), Number(m[6]),
  );
  if (Number.isNaN(millis)) return null;

  const fraction = Number((m[7] ?? '').padEnd(6, '0') || '0');

  const zone = m[8];
  let offsetMinutes = 0;
  if (zone !== 'Z') {
    const clean = zone.replace(':', '');
    const hours = Number(clean.slice(1, 3));
    const minutes = Number(clean.slice(3, 5) || '0');
    offsetMinutes = (hours * 60 + minutes) * (clean[0] === '-' ? -1 : 1);
  }

  return (millis - offsetMinutes * 60_000) * 1000 + fraction;
}

function micros(ts: string): number {
  const value = tsMicros(ts);
  if (value === null) throw new Error(`sunucu damgası çözümlenemedi: ${ts}`);
  return value;
}

/**
 * İki imleci karşılaştırır: önce damga, eşitse kimlik.
 *
 * Kimlik karşılaştırması metin sırasıdır; küçük harfli UUID'de bu
 * Postgres'in `uuid` sıralamasıyla aynı sonucu verir.
 */
export function compareKeys(a: PullKey, b: PullKey): number {
  const diff = micros(a.ts) - micros(b.ts);
  if (diff !== 0) return Math.sign(diff);
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function maxKey(a: PullKey, b: PullKey): PullKey {
  return compareKeys(b, a) > 0 ? b : a;
}

export function sameKey(a: PullKey, b: PullKey): boolean {
  return a.ts === b.ts && a.id === b.id;
}

/**
 * PostgREST süzgeci: bu imleçten SONRAKİ satırlar.
 *
 * `server_updated_at > ts` VEYA (`= ts` ve `id > kimlik`). Değerler çift
 * tırnak içinde: damga `.`, `:` ve `+` taşıyor, bunlar PostgREST'in
 * mantık ağacında ayrılmış karakterler.
 */
export function keyFilter(key: PullKey): string {
  const ts = quote(key.ts);
  return `server_updated_at.gt.${ts},and(server_updated_at.eq.${ts},id.gt.${quote(key.id)})`;
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * İmleci biraz geriye alır — GEÇ COMMIT EDİLEN İŞLEMLER İÇİN.
 *
 * Sunucudaki damga işlemin BAŞLANGICINDA alınıyor, satır ise commit
 * edilince görünür oluyor. Araya giren bir istek, damgası daha eski ama
 * henüz görünmeyen bir satırı atlayıp imleci ötesine taşıyabilir; o satır
 * bir daha hiç istenmez. Her turun birkaç dakikalık bir pencereyi yeniden
 * okuması bunu kapatıyor. Fazladan inen satır zararsız: aynı içerik
 * yeniden yazılmıyor.
 *
 * Kaydedilen imleç asla geriye gitmez (bkz. `maxKey`); bu yalnızca
 * okumanın başlangıç noktası.
 */
export function lookbackKey(key: PullKey, windowMs: number): PullKey {
  if (sameKey(key, PULL_START)) return key;

  const target = tsMicros(key.ts);
  if (target === null) return PULL_START;

  const shifted = Math.max(0, target - windowMs * 1000);
  return { ts: formatMicros(shifted), id: PULL_START.id };
}

/** Mikrosaniyeyi Postgres'in yazdığı biçime çevirir. */
export function formatMicros(value: number): string {
  const seconds = Math.floor(value / 1_000_000);
  const fraction = value - seconds * 1_000_000;
  const base = new Date(seconds * 1000).toISOString().slice(0, 19);
  return `${base}.${String(fraction).padStart(6, '0')}+00:00`;
}
