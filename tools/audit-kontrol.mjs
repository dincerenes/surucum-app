// CI güvenlik kapısı: `npm audit --omit=dev` içindeki high/critical
// uyarılardan İNCELENMEMİŞ olan varsa kırmızıya döner.
//
// Düz `npm audit --audit-level=high` belirli bir uyarıyı muaf tutamıyor:
// düzeltmesi olmayan, uygulamaya hiç girmeyen bir derleme aracı uyarısı
// her push'u kırıyor, gerçekten yeni bir uyarı da o gürültüde kayboluyordu.
// Aşağıdaki liste yalnızca incelenmiş uyarılar; her birinin gerekçesi
// docs/bilinen-uyarilar.md'de. Moderate uyarılar kapıyı zaten kilitlemez.

import { execFileSync } from 'node:child_process';

const INCELENDI = new Set([
  'GHSA-vfj7-8cjw-p6xm', // braces — Metro dosya izleyicisi, derleme aracı
  'GHSA-86w9-cpqp-85rv', // node-forge — Expo CLI / imzalama aracı, derleme aracı
]);

let raw;
try {
  raw = execFileSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8' });
} catch (e) {
  // Uyarı bulununca npm sıfırdan farklı çıkıyor; çıktı yine JSON.
  raw = e.stdout;
}

const { vulnerabilities = {} } = JSON.parse(raw);
const yeni = new Map();
for (const [paket, v] of Object.entries(vulnerabilities)) {
  for (const via of v.via) {
    if (typeof via !== 'object') continue;
    if (via.severity !== 'high' && via.severity !== 'critical') continue;
    const id = via.url.split('/').pop();
    if (!INCELENDI.has(id)) yeni.set(id, `${paket} (${via.severity}): ${via.title} — ${via.url}`);
  }
}

if (yeni.size > 0) {
  console.error('İncelenmemiş high/critical güvenlik uyarısı:');
  for (const satir of yeni.values()) console.error(`  ${satir}`);
  console.error('Düzelt ya da incele, gerekçeyi docs/bilinen-uyarilar.md\'ye yazıp listeye ekle.');
  process.exit(1);
}
console.log(`Yeni high/critical uyarı yok (${INCELENDI.size} incelenmiş uyarı muaf).`);
