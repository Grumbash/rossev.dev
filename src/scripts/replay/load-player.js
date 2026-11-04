// Imports the lazy replay chunk and the page language's strings. Plain JS for the same reason as
// ../nca/load-monogram.js: the extra parentheses keep Vite from wrapping the imports in its
// module-preload helper in the eager bundle.
export const loadPlayer = (lang) =>
  Promise.all([import(('./player')), lang === 'ru' ? import(('../../i18n/ru')) : import(('../../i18n/en'))]).then(
    ([player, dict]) => ({ startPlayer: player.startPlayer, strings: (dict.ru || dict.en).topology })
  );
