/**
 * iOS sahne (scene) yaşam döngüsü.
 *
 * iOS 27 sahne yaşam döngüsünü benimsemeyen uygulamayı AÇILIŞTA
 * durduruyor (`UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`).
 * Uygulama simülatörde (iOS 26) çalışıyor, iOS 27'deki gerçek telefonda
 * dokununca kapanıyordu (24 Eylül 2026).
 *
 * Expo bunun için `ExpoAppSceneDelegate`'i getiriyor ama `expo prebuild`
 * şablonu henüz eski düzende. `ios/` klasörü üretilen bir klasör
 * (gitignore'da); elle düzeltilirse bir sonraki prebuild'de kaybolur. Bu
 * eklenti her prebuild'de iki şeyi yapıyor:
 *
 * 1. Info.plist'e sahne yapılandırması: sahne temsilcisi Expo'nunki.
 * 2. AppDelegate: pencereyi kendisi AÇMIYOR (onu sahne temsilcisi açıyor)
 *    ve fabrikayı `ExpoReactNativeFactoryProvider` ile sahneye veriyor.
 *
 * Sahne yaşam döngüsü iOS 13'ten beri var; eski iOS sürümleri de aynı
 * düzenle açılıyor. Şablon güncellenince bu eklenti kaldırılabilir:
 * prebuild çıktısında `UIApplicationSceneManifest` kendiliğinden varsa.
 */
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const SCENE_DELEGATE = 'EXExpoAppSceneDelegate';

function withSceneManifest(config) {
  return withInfoPlist(config, (c) => {
    c.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: SCENE_DELEGATE,
          },
        ],
      },
    };
    return c;
  });
}

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (c) => {
    if (c.modResults.language !== 'swift') {
      throw new Error('with-scene-lifecycle: yalnızca Swift AppDelegate destekleniyor.');
    }
    let src = c.modResults.contents;

    if (!src.includes('ExpoReactNativeFactoryProvider')) {
      src = src.replace(
        'class AppDelegate: ExpoAppDelegate {',
        'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {',
      );
    }

    // Pencereyi ve React Native'i artık sahne temsilcisi başlatıyor.
    src = src.replace(
      /#if os\(iOS\) \|\| os\(tvOS\)\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\s*factory\.startReactNative\([\s\S]*?\)\s*#endif\s*/,
      '',
    );

    if (!src.includes('ExpoReactNativeFactoryProvider') || src.includes('UIScreen.main.bounds')) {
      throw new Error('with-scene-lifecycle: AppDelegate beklenen şablonda değil; eklentiyi güncelle.');
    }
    c.modResults.contents = src;
    return c;
  });
}

module.exports = function withSceneLifecycle(config) {
  return withSceneAppDelegate(withSceneManifest(config));
};
