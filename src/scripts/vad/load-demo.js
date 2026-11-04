// Imports the lazy voice-demo chunk. Plain JS for the same reason as ../nca/load-monogram.js:
// the extra parentheses keep Vite from wrapping the import in its preload helper.
export const loadVadDemo = () => import(('./demo'));
