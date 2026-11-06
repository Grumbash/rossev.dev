// The tab misses you. While the page is hidden, its favicon (the lime GR square of /favicon.svg)
// wilts a stage at a time: the lime fades toward grey and the square sags, its columns sliding down,
// more at the edges. The title whispers "I'll wait…" (data-tab-wait on the toast element, in the
// page's language). Back on the tab, the icon grows back through the same stages in a second (at
// once under reduced motion) and the title returns. Hidden tabs have their timers throttled: a stage
// that comes late only wilts it slower.
/** When each stage starts after the tab is hidden. */
export const STAGES_MS = [15_000, 40_000, 80_000, 130_000, 190_000, 270_000];

function noise(x: number) {
  const s = Math.sin(x * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** The icon at `k` of the way wilted (0 itself, 1 fully): RGBA, `w` × `h`, a new array. */
export function wilt(px: Uint8ClampedArray, w: number, h: number, k: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(px.length);
  if (k <= 0) {
    out.set(px);
    return out;
  }
  const maxDrop = h * 0.4;
  for (let x = 0; x < w; x++) {
    // The edges sag most, the middle least, every column a little its own way.
    const edge = Math.abs(x - (w - 1) / 2) / ((w - 1) / 2);
    const drop = Math.round(k * maxDrop * (0.35 + 0.45 * edge + 0.2 * noise(x)));
    for (let y = h - 1; y >= 0; y--) {
      const from = y - drop;
      if (from < 0) continue;
      const i = (y * w + x) * 4;
      const j = (from * w + x) * 4;
      // Faded toward its own grey (black stays black), and a little darker, by how far along it is.
      const lum = 0.3 * px[j] + 0.59 * px[j + 1] + 0.11 * px[j + 2];
      for (let c = 0; c < 3; c++) out[i + c] = (px[j + c] + (lum - px[j + c]) * k * 0.85) * (1 - 0.2 * k);
      out[i + 3] = px[j + 3];
    }
  }
  return out;
}

export function initTab() {
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!icon || typeof document.createElement('canvas').getContext !== 'function') return;
  const original = icon.getAttribute('href') ?? '/favicon.svg';
  const SIZE = 32;
  let base: Uint8ClampedArray | null = null;
  let stage = 0;
  let timers: number[] = [];
  let title = document.title;

  // The icon as pixels, drawn once from the SVG the page already has.
  const pixels = () =>
    base
      ? Promise.resolve(base)
      : new Promise<Uint8ClampedArray | null>((done) => {
          const img = new Image();
          img.onload = () => {
            const c = document.createElement('canvas');
            c.width = c.height = SIZE;
            const ctx = c.getContext('2d');
            if (!ctx) return done(null);
            ctx.drawImage(img, 0, 0, SIZE, SIZE);
            done((base = ctx.getImageData(0, 0, SIZE, SIZE).data));
          };
          img.onerror = () => done(null);
          img.src = original;
        });

  const show = async (k: number) => {
    stage = k;
    if (k === 0) {
      icon.setAttribute('href', original);
      delete icon.dataset.wilt;
      return;
    }
    const px = await pixels();
    if (!px) return;
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(new ImageData(wilt(px, SIZE, SIZE, k / STAGES_MS.length), SIZE, SIZE), 0, 0);
    icon.setAttribute('href', c.toDataURL('image/png'));
    icon.dataset.wilt = String(k);
  };

  const whisper = () => document.getElementById('brutal-toast')?.dataset.tabWait ?? '';
  const onChange = () => {
    timers.forEach(clearTimeout);
    timers = [];
    if (document.visibilityState === 'hidden') {
      title = document.title;
      const w = whisper();
      if (w) document.title = `${w} · ${title}`;
      // From the hide on, by the clock: a throttled timer that fires late lands on the stage it is.
      const hiddenAt = Date.now();
      const next = () => {
        const due = STAGES_MS.filter((t) => Date.now() - hiddenAt >= t).length;
        if (due > stage) void show(due);
        const later = STAGES_MS[due];
        if (later !== undefined) timers.push(window.setTimeout(next, later - (Date.now() - hiddenAt)));
      };
      next();
      return;
    }
    document.title = title;
    // Grows back through the same stages, a tenth of a second each; at once under reduced motion.
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return void show(0);
    for (let k = stage - 1, n = 1; k >= 0; k--, n++) timers.push(window.setTimeout(() => void show(k), n * 110));
  };
  document.addEventListener('visibilitychange', onChange);
  // Loaded by the first hide (./site.ts): that one has already happened.
  if (document.visibilityState === 'hidden') onChange();
}
