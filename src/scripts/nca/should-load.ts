// Whether the GR model may load at all: shared by the home monogram (./loader.ts) and the post-page
// companion (../companion.ts). Its own module, so importing it does not pull either loader along.
type Connection = { saveData?: boolean; effectiveType?: string };

/** False when the browser asks to save data (Save-Data header switch, or the
 * prefers-reduced-data media query where supported) or reports a 2G-class connection. */
export function shouldLoadNca(nav: Navigator): boolean {
  const c = (nav as Navigator & { connection?: Connection }).connection;
  if (c?.saveData || c?.effectiveType === '2g' || c?.effectiveType === 'slow-2g') return false;
  return !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-data: reduce)').matches);
}
