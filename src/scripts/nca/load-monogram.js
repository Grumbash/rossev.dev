// Imports the lazy GR-monogram chunk. Plain JS on purpose: Vite wraps a dynamic
// import of a bare string literal in its module-preload helper (~0.4 KB gzip, more
// than the rest of the eager loader), and the extra parentheses opt out of that.
// In a .ts file esbuild would strip them before Vite looks. ./monogram has no
// static imports, so there is nothing to preload anyway.
export const loadMonogram = () => import(('./monogram'));
