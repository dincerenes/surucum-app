module.exports = function (api) {
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Drizzle'ın ürettiği drizzle/migrations.js, .sql dosyalarını import eder.
      // Bu eklenti onları derleme anında string sabitine çevirip bundle'a gömer.
      ['inline-import', { extensions: ['.sql'] }],
    ],
  };
};
