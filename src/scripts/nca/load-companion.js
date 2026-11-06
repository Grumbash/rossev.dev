// Imports the lazy GR-companion chunk. Plain JS for the same reason as ./load-monogram.js: the
// extra parentheses keep Vite from wrapping the import in its module-preload helper.
export const loadCompanion = () => import(('./companion'));
