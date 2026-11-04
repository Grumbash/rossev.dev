// Imports the lazy 3D topology engine. Plain JS for the same reason as ./nca/load-monogram.js: the
// extra parentheses keep Vite from wrapping the import in its module-preload helper.
export const loadEngine = () => import(('./iso-engine'));
