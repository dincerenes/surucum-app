/**
 * `node --test` için modül çözümleyici.
 *
 * Uygulama kodu Metro'nun anladığı biçimde yazılıyor: `@/` takma adı ve
 * uzantısız göreli importlar. Node ikisini de tanımıyor; bu kanca olmadan
 * senkron ve repo katmanı hiç test edilemiyordu — tam da veri kaybının
 * yaşandığı katmanlar.
 *
 * Üçüncü iş: `src/db/client.ts` yerine `tools/test-db.ts` yüklenir. Gerçek
 * istemci `expo-sqlite`'ı (yerli modül) açıyor; testte aynı Drizzle expo
 * sürücüsü `node:sqlite` üzerinde, migration'ları uygulanmış bellek içi
 * bir veritabanıyla çalışıyor. Yani testler üretimdeki SQL'in AYNISINI
 * koşuyor; taklit olan yalnızca sürücünün altındaki bağlantı.
 *
 * Kullanım: `node --import ./tools/test-register.mjs --test ...`
 */

import { existsSync, statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const REAL_CLIENT = path.join(SRC, 'db', 'client.ts');
const TEST_CLIENT = path.join(ROOT, 'tools', 'test-db.ts');

const isFile = (p) => existsSync(p) && statSync(p).isFile();

/** Metro'nun yaptığı gibi: önce tam ad, sonra uzantılar, sonra klasör index'i. */
function locate(base) {
  for (const candidate of [
    base, `${base}.ts`, `${base}.tsx`, `${base}.js`,
    path.join(base, 'index.ts'), path.join(base, 'index.js'),
  ]) {
    if (isFile(candidate)) return candidate;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    let file = null;

    if (specifier.startsWith('@/')) {
      file = locate(path.join(SRC, specifier.slice(2)));
    } else if (
      (specifier.startsWith('./') || specifier.startsWith('../'))
      && context.parentURL?.startsWith('file:')
    ) {
      file = locate(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
    }

    if (!file) return nextResolve(specifier, context);
    if (file === REAL_CLIENT) file = TEST_CLIENT;
    return { url: pathToFileURL(file).href, shortCircuit: true };
  },
});
