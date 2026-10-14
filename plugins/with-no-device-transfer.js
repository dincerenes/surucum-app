/**
 * Android: uygulama verisi hiçbir yedeğe ve telefondan telefona aktarıma
 * girmez.
 *
 * `allowBackup: false` Google bulut yedeğini kapatıyor, ama Android 12+
 * bazı üreticilerin telefonunda cihazdan cihaza aktarımı KAPATMIYOR
 * (developer.android.com, Android 12 davranış değişiklikleri). Gizlilik
 * politikası "veriler sistem yedeğine girmez" diyor; kayıtların tek yolu
 * hesabın kendi eşitlemesi olmalı — aktarılan bir kopya, silinen hesabın
 * verisini yeni telefonda yaşatırdı.
 *
 * Bu eklenti her prebuild'de `res/xml/data_extraction_rules.xml`'i yazıp
 * `<application android:dataExtractionRules>`'a bağlıyor.
 */
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const RULES_NAME = 'data_extraction_rules';
const DOMAINS = ['root', 'file', 'database', 'sharedpref', 'external'];

const RULES_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- plugins/with-no-device-transfer.js üretiyor; elle değiştirme. -->
<data-extraction-rules>
  <cloud-backup>
${DOMAINS.map((d) => `    <exclude domain="${d}" path="." />`).join('\n')}
  </cloud-backup>
  <device-transfer>
${DOMAINS.map((d) => `    <exclude domain="${d}" path="." />`).join('\n')}
  </device-transfer>
</data-extraction-rules>
`;

function withRulesFile(config) {
  return withDangerousMod(config, ['android', (c) => {
    const dir = path.join(c.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${RULES_NAME}.xml`), RULES_XML);
    return c;
  }]);
}

function withRulesAttribute(config) {
  return withAndroidManifest(config, (c) => {
    const app = c.modResults.manifest.application?.[0];
    if (!app) throw new Error('with-no-device-transfer: <application> bulunamadı.');
    app.$['android:dataExtractionRules'] = `@xml/${RULES_NAME}`;
    return c;
  });
}

module.exports = (config) => withRulesAttribute(withRulesFile(config));
