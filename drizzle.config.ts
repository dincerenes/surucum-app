import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',

  // 'expo' sürücüsü drizzle-kit'e drizzle/migrations.js paketini üretmesini söyler.
  // Bu dosya olmadan React Native tarafında migration çalıştırılamaz.
  // Not: expo sürücüsünde YALNIZCA `generate` çalışır — push/pull/migrate/studio bloke.
  driver: 'expo',

  schema: './src/db/schema/index.ts',
  out: './drizzle',

  // camelCase alan adlarını snake_case sütunlara çevirir.
  // Aynı değer çalışma anında drizzle() çağrısına da verilmeli, yoksa
  // üretilen migration ile çalışan sorgular farklı sütun adı kullanır.
  casing: 'snake_case',

  migrations: { prefix: 'index' },

  verbose: true,
  strict: true,
});
