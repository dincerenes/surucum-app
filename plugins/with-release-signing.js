/**
 * Android yayın imzası.
 *
 * Expo'nun şablonu yayın derlemesini de HATA AYIKLAMA anahtarıyla
 * imzalıyor; Google Play böyle bir paketi reddediyor. Mağazaya giden
 * paket sürücünün kendi "yükleme anahtarı" ile imzalanmalı.
 *
 * Anahtar ve şifreleri DEPODA DEĞİL: bilgisayardaki
 * `~/.gradle/gradle.properties` dosyasında duruyor:
 *
 *   SURUCUM_UPLOAD_STORE_FILE=/Users/.../surucum-upload.keystore
 *   SURUCUM_UPLOAD_STORE_PASSWORD=...
 *   SURUCUM_UPLOAD_KEY_ALIAS=surucum-upload
 *   SURUCUM_UPLOAD_KEY_PASSWORD=...
 *
 * Bunlar yoksa yayın derlemesi eskisi gibi hata ayıklama anahtarıyla
 * imzalanıyor (bilgisayarda yayın sürümünü denemek için yeter) ve Gradle
 * bir uyarı basıyor.
 *
 * `android/` üretilen bir klasör (gitignore'da); elle düzeltilirse bir
 * sonraki prebuild'de kaybolur. Bu eklenti her prebuild'de
 * `app/build.gradle`'a imza ayarını ekliyor.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// surucum: yayın imzası';

const RELEASE_SIGNING = `
        ${MARKER}
        release {
            if (findProperty('SURUCUM_UPLOAD_STORE_FILE')) {
                storeFile file(findProperty('SURUCUM_UPLOAD_STORE_FILE'))
                storePassword findProperty('SURUCUM_UPLOAD_STORE_PASSWORD')
                keyAlias findProperty('SURUCUM_UPLOAD_KEY_ALIAS')
                keyPassword findProperty('SURUCUM_UPLOAD_KEY_PASSWORD')
            }
        }`;

const RELEASE_PICK = `if (!findProperty('SURUCUM_UPLOAD_STORE_FILE')) {
                logger.warn('Sürücüm: yükleme anahtarı yok, yayın paketi hata ayıklama anahtarıyla imzalanıyor. Google Play bunu kabul etmez.')
            }
            signingConfig findProperty('SURUCUM_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug`;

function addReleaseSigning(gradle) {
  if (gradle.includes(MARKER)) return gradle;

  // signingConfigs { debug { ... } } bloğunun sonuna release ekle.
  const debugBlock = /(signingConfigs\s*\{\s*debug\s*\{[^}]*\})/;
  if (!debugBlock.test(gradle)) {
    throw new Error('with-release-signing: signingConfigs.debug bulunamadı; şablon değişmiş.');
  }
  let out = gradle.replace(debugBlock, `$1${RELEASE_SIGNING}`);

  // buildTypes.release içindeki hata ayıklama imzasını değiştir.
  const releaseType = /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;
  if (!releaseType.test(out)) {
    throw new Error('with-release-signing: buildTypes.release imzası bulunamadı; şablon değişmiş.');
  }
  out = out.replace(releaseType, `$1${RELEASE_PICK}`);
  return out;
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (c) => {
    c.modResults.contents = addReleaseSigning(c.modResults.contents);
    return c;
  });
};

module.exports.addReleaseSigning = addReleaseSigning;
