const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Drizzle'ın ürettiği .sql migration dosyaları çözümlenebilsin diye.
// Bu satır olmadan uygulama açılışta migration import'unda çöker.
config.resolver.sourceExts.push('sql');

module.exports = config;
