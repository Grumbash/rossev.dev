// The PR #11 replay on the hero topology, loaded lazily by ../topology-replay.ts. It plays a film of
// the real agent run (src/data/replay-pr11.json): the camera flies to each node as the plan, the
// code, the tests, the judge's catch, the fix and the merge happen, one caption at a time, drawn on
// the canvas next to the node. The G→R mis-heal plays from frames recorded on the real pre-fix
// weights (public/replay/pr11-gr.json). The visitor can take over at any moment (./sim.ts has the
// rules): inject a fault, switch the judge off, click a node, or cut the mini GR, which then
// regrows on the real shipped model (./heal.ts). Left alone, the film comes back.
import replay from '../../data/replay-pr11.json';
import type { Dict } from '../../i18n';
import type { IsoApi, IsoGuide, IsoView } from '../iso-engine';
import { clockTimes, film, shotAt } from './director';
import { PALETTE, decodeFrame } from './frames';
import { createHealer } from './heal';
import {
  START,
  analyticsFor,
  cutResult,
  injectFault,
  resume,
  showResumePrompt,
  takeover,
  tick,
  toggleJudge,
  type Outcome,
  type SimState,
} from './sim';

type Lang = 'en' | 'ru';
type Ev = { kind: string; node: number; t: string; caption: Record<Lang, string>; lines?: string[] };
/** The page's topology strings (src/i18n), loaded with this chunk rather than shipped in the HTML. */
type Strings = Dict['topology'];
type Row = { text: string; color: string; mark?: string };
type Rect = { x: number; y: number; w: number; h: number };

const FRAMES_URL = '/replay/pr11-gr.json';
const WEIGHTS_URL = '/nca/gr.bin';
/** A fault's walk through the system, from injection to verdict. */
const RUN_MS = 3000;
const IDLE_TICK_MS = 250;
/** The cut brush, as a fraction of the grid side: the same as the GR monogram and ./frames.ts cut. */
const BRUSH = 0.12;

// Moments inside a shot, as progress 0..1.
const ESTABLISH = 0.18; // plan: the wide shot before the dolly in
const APPROVE_AT = 0.55;
const CUT_END = 0.06; // catch: the vertical cut is drawn
const REGROW_END = 0.27; // ...the recorded frames have played
const STAMP_AT = 0.31; // ...the judge's beam has reached the sandbox and the stamp lands
const HEAL_FROM = 0.2; // fix: the retrained model's GR fades in
const HEAL_TO = 0.6;
const MERGE_AT = 0.15;

const INK = '#0A0A0A';
const PAPER = '#F4F0EA';
const LIME = '#C8FF00';
const RED = '#FF2A55';
const YELLOW = '#FFD600';
const MUTED = '#8A93AA';
const OK = '#16794A'; // a passing test, on paper
const BAD = '#C4122F'; // a failing test, on paper
const SANDBOX = 4;
const JUDGE = 3;
const BUILDER = 2;
const PLAN = 0;

export function startPlayer(o: { api: IsoApi; card: HTMLElement; strings: Strings; track: (p: Record<string, string>) => void }) {
  const { api, card, track, strings } = o;
  const copy = strings.replayCanvas;
  const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lang: Lang = document.documentElement.lang === 'ru' ? 'ru' : 'en';
  const events = replay.events as Ev[];
  const F = film(replay);
  const N = events.length;
  const times = clockTimes(events);
  const css = getComputedStyle(document.documentElement);
  const DISPLAY = css.getPropertyValue('--font-display').trim() || 'sans-serif';
  const MONO = css.getPropertyValue('--font-mono').trim() || 'monospace';

  const $ = <T extends HTMLElement>(sel: string) => card.querySelector<T>(sel);
  const badge = $('[data-replay-badge]');
  const live = $('[data-replay-live]');
  const faultBtn = $<HTMLButtonElement>('[data-sim-fault]');
  const judgeBtn = $<HTMLButtonElement>('[data-sim-judge]');
  const judgeState = $('[data-sim-judge-state]');
  const resumeBtn = $<HTMLButtonElement>('[data-replay-resume]');
  const pauseBtn = $<HTMLButtonElement>('[data-replay-pause]');
  const timeline = $('[data-replay-timeline]');
  const stops = [...card.querySelectorAll<HTMLElement>('[data-replay-stop]')];

  // Reduced motion: no loop. The film rests on its last shot, each scrub is a still, results are instant.
  let s: SimState = rm ? { ...START, t: F.shots[N - 1].start } : START;
  let started = false;
  // Paused by the visitor (the pause toggle, or a scrub: the film stays where they put it).
  let paused = false;
  // After a scrub the shot shows complete, as a still; playing again animates it from its start.
  let still = false;
  let attached = false;

  // The recorded frames (G→R on the pre-fix weights), fetched with the film, decoded once.
  let rec: { size: number; frames: Uint8Array[]; steps: number[]; source: string } | null = null;
  fetch(FRAMES_URL)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (!j) return;
      rec = {
        size: j.size,
        frames: j.frames.map((f: { data: string }) => decodeFrame(f.data, j.size)),
        steps: j.frames.map((f: { step: number }) => f.step),
        source: j.source[lang],
      };
      // Under reduced motion every frame is a deliberate redraw: only when the GR is on screen.
      if (!rm || s.mode === 'live' || /test|catch|fix/.test(events[shotAt(F, s.t).index].kind)) api.redraw();
    })
    .catch(() => {});

  // The visitor's run.
  let run: { judge: boolean; ms: number; outcome: Outcome; done: boolean } | null = null;
  let shown: Outcome | null = null; // the verdict on screen (data-outcome), set when its animation lands
  let message = '';
  let messageNode = SANDBOX;
  let focusNode: number | null = null;
  let tile: Rect | null = null; // where the mini GR was drawn this frame: the cut's hit area
  let stroke: [number, number][] | null = null;
  let grab: Rect | null = null; // the tile as it was when the stroke started: the stroke maps to it
  let liveFrame: Uint8Array | null = null;
  let healing = false;
  const healer = createHealer(WEIGHTS_URL);
  let gen = 0; // bumps on resume: names each run's stamp, so it shakes the scene once
  let landed = ''; // the stamp that already shook the scene in this shot / run
  let camKey = '';
  let idleTimer: ReturnType<typeof setInterval> | undefined;

  const busy = () => (run !== null && !run.done) || healing;

  function apply(next: SimState) {
    const a = analyticsFor(s, next);
    // Outcomes go out when they land on screen, not when the rules decide them.
    if (a && a.action !== 'outcome') track({ action: a.action });
    if (s.mode === 'live' && next.mode === 'replay') {
      run = null;
      shown = null;
      liveFrame = null;
      healing = false;
      focusNode = null;
      message = '';
      gen++;
      healer.cancel();
      camKey = '';
    }
    if (next.mode === 'live') window.playIso?.(); // a phone's poster needs frames for the run
    s = next;
    syncIdle();
    paint();
    api.redraw();
  }

  /** The idle clock ticks only while live and attached: Explore pauses it, so nothing resumes behind it. */
  function syncIdle() {
    const on = attached && s.mode === 'live';
    if (on && !idleTimer) idleTimer = setInterval(idle, IDLE_TICK_MS);
    if (!on && idleTimer) idleTimer = void clearInterval(idleTimer);
  }

  /** Only what the visitor caused reaches the live region: autoplay would talk over everything. */
  function announce(text: string) {
    if (live) live.textContent = text;
  }

  function setPaused(on: boolean) {
    paused = on;
    if (!on) still = false;
    pauseBtn?.setAttribute('aria-pressed', String(on));
    api.redraw();
  }

  // The idle clock runs only once a result is on screen: watching an animation is not being idle.
  function idle() {
    if (busy()) return;
    const next = tick(s, IDLE_TICK_MS, F.length);
    if (next.mode !== s.mode) apply(next); // came back by itself: not announced
    else {
      s = next;
      paint();
    }
  }

  function land(outcome: Outcome, text: string, node: number) {
    shown = outcome;
    message = text;
    messageNode = node;
    s = { ...s, idleMs: 0 };
    track({ action: 'outcome', outcome });
    announce(text);
    paint();
    api.redraw();
  }

  function fault() {
    const next = injectFault(s, 'logic');
    run = { judge: next.judge, ms: 0, outcome: next.outcome!, done: false };
    shown = null;
    focusNode = null;
    liveFrame = null;
    message = copy.faultRun;
    messageNode = BUILDER;
    landed = '';
    apply(next);
    announce(message);
    if (rm) finishRun();
  }
  function finishRun() {
    if (!run) return;
    run.done = true;
    run.ms = RUN_MS;
    if (run.outcome === 'caught') land('caught', copy.caughtLive, JUDGE);
    else land('shipped', copy.shippedWhy, PLAN);
  }

  function judge() {
    run = null;
    shown = null;
    message = '';
    apply(toggleJudge(s));
  }

  function node(idx: number) {
    focusNode = idx;
    message = copy.nodes[idx] ?? '';
    messageNode = idx;
    apply(takeover(s));
    announce(message);
  }

  function back() {
    apply(resume(s));
    announce(events[shotAt(F, s.t).index].caption[lang]);
    if (document.activeElement === resumeBtn) timeline?.focus();
  }

  function scrub(i: number) {
    const to = Math.max(0, Math.min(N - 1, i));
    track({ action: 'scrub' });
    landed = '';
    camKey = '';
    apply({ ...(s.mode === 'live' ? resume(s) : s), t: F.shots[to].start });
    setPaused(true);
    still = true;
    announce(events[to].caption[lang]);
  }

  // The cut: preview it at once on the grown frame, then let the real model regrow it.
  function cutGR(points: [number, number][]) {
    const size = rec?.size ?? 56;
    const base = (liveFrame ?? rec?.frames[0])?.slice();
    const strokes: [number, number, number, number][] = [];
    for (let i = 1; i < points.length; i++) strokes.push([...points[i - 1], ...points[i]]);
    if (base) {
      const r = BRUSH * size;
      for (const [x0, y0, x1, y1] of strokes) {
        const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * size) + 1;
        for (let k = 0; k <= n; k++) {
          const cx = (x0 + ((x1 - x0) * k) / n) * size;
          const cy = (y0 + ((y1 - y0) * k) / n) * size;
          for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(size - 1, cy + r); y++)
            for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(size - 1, cx + r); x++)
              if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 < r * r) base[y * size + x] = 0;
        }
      }
      liveFrame = base;
    }
    run = null;
    shown = null;
    focusNode = null;
    healing = true;
    message = copy.cutHealing;
    messageNode = SANDBOX;
    apply({ ...takeover(s), outcome: null });
    announce(message);
    healer.cut(strokes, (idx) => {
      liveFrame = idx;
      if (!rm) api.redraw();
    }).then(
      (r) => {
        if (!r) return; // a newer cut, or the film came back
        healing = false;
        const next = cutResult(s, r.mse);
        s = next;
        land(next.outcome!, (next.outcome === 'healed' ? copy.healed : copy.unhealed).replace('{mse}', r.mse.toPrecision(2)), SANDBOX);
      },
      () => {
        healing = false;
        message = '';
        paint();
        api.redraw();
      }
    );
  }

  // ---- DOM: the badge, the controls, the timeline, the live region and the card's data-* ----

  const stampFor = (i: number, p: number): string => {
    const k = events[i].kind;
    if (k === 'plan' && p >= APPROVE_AT) return 'approved';
    if (k === 'catch' && p >= STAMP_AT) return 'caught';
    if (k === 'merge' && p >= MERGE_AT) return 'merged';
    return '';
  };
  const set = (name: string, v: string | null) => (v ? card.setAttribute(name, v) : card.removeAttribute(name));

  let painted = '';
  function paint() {
    const { index, progress } = shotAt(F, s.t);
    const liveMode = s.mode === 'live';
    const stamp = liveMode ? (shown === 'caught' || shown === 'shipped' ? shown : '') : stampFor(index, rm || still ? 1 : progress);
    const offer = attached && showResumePrompt(s);
    const key = [index, s.mode, s.judge, shown, offer, stamp].join('|');
    if (key === painted) return;
    painted = key;
    set('data-replay-shot', String(index));
    set('data-replay-stamp', stamp);
    set('data-outcome', shown);
    card.classList.toggle('is-live', liveMode);
    if (badge) badge.textContent = liveMode ? strings.yourRun : strings.replayBadge;
    judgeBtn?.setAttribute('aria-pressed', String(s.judge));
    if (judgeState) judgeState.textContent = s.judge ? strings.judgeOn : strings.judgeOff;
    if (resumeBtn && resumeBtn.hidden === offer) {
      if (!offer && document.activeElement === resumeBtn) faultBtn?.focus();
      resumeBtn.hidden = !offer;
    }
    if (timeline) {
      timeline.setAttribute('aria-valuenow', String(index));
      timeline.setAttribute('aria-valuetext', `${times[index]} · ${events[index].caption[lang]}`);
    }
    stops.forEach((st, i) => st.classList.toggle('is-current', i === index));
  }

  faultBtn?.addEventListener('click', fault);
  judgeBtn?.addEventListener('click', judge);
  resumeBtn?.addEventListener('click', back);
  pauseBtn?.addEventListener('click', () => setPaused(!paused));

  // The timeline: arrows step, Home/End jump, Space pauses or plays, a click or drag on a stop scrubs.
  function key(k: string): boolean {
    if (k === ' ') {
      setPaused(!paused);
      return true;
    }
    const i = shotAt(F, s.t).index;
    const to = ({ ArrowLeft: i - 1, ArrowDown: i - 1, ArrowRight: i + 1, ArrowUp: i + 1, Home: 0, End: N - 1 } as Record<string, number>)[k];
    if (to === undefined) return false;
    scrub(to);
    return true;
  }
  timeline?.addEventListener('keydown', (e) => {
    if (key(e.key)) e.preventDefault();
  });
  const stopAt = (x: number) => {
    let best = 0;
    let bestD = Infinity;
    stops.forEach((st, i) => {
      const r = st.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - x);
      if (d < bestD) [best, bestD] = [i, d];
    });
    return best;
  };
  let scrubbing = false;
  timeline?.addEventListener('pointerdown', (e) => {
    scrubbing = true;
    timeline.setPointerCapture?.(e.pointerId);
    scrub(stopAt(e.clientX));
  });
  timeline?.addEventListener('pointermove', (e) => {
    if (!scrubbing) return;
    const i = stopAt(e.clientX);
    if (i !== shotAt(F, s.t).index) scrub(i);
  });
  const endScrub = () => (scrubbing = false);
  timeline?.addEventListener('pointerup', endScrub);
  timeline?.addEventListener('pointercancel', endScrub);

  // ---- Canvas ----

  // Palette frames → small canvases, scaled up crisp when drawn.
  const tileCache = new Map<Uint8Array, HTMLCanvasElement>();
  const RGB = PALETTE.map((c) => (c === 'transparent' ? null : [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16))));
  function frameCanvas(idx: Uint8Array, size: number): HTMLCanvasElement {
    let c = tileCache.get(idx);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = size;
    const img = new ImageData(size, size);
    idx.forEach((v, i) => {
      const rgb = RGB[v];
      if (!rgb) return;
      img.data.set(rgb, i * 4);
      img.data[i * 4 + 3] = 255;
    });
    c.getContext('2d')!.putImageData(img, 0, 0);
    if (tileCache.size > 40) tileCache.clear(); // live frames stream in: keep the cache small
    tileCache.set(idx, c);
    return c;
  }

  function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
    const out: string[] = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > max) {
        out.push(line);
        line = word;
      } else line = next;
    }
    if (line) out.push(line);
    return out;
  }
  function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
    if (ctx.measureText(text).width <= max) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
    return `${t}…`;
  }
  const inCanvas = (v: IsoView, p: { x: number; y: number } | null) =>
    !!p && p.x > 0 && p.y > 0 && p.x < v.width && p.y < v.height;
  const ease = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;

  /** The caption: a paper card on the side of the canvas away from its node, with a leader line. */
  function caption(v: IsoView, nodeIdx: number, kicker: string, text: string, rows: Row[], appear: number): Rect {
    const { ctx } = v;
    const narrow = v.width < 520;
    const fs = narrow ? 13 : 16;
    const lh = Math.round(fs * 1.3);
    const pad = narrow ? 8 : 12;
    const kh = narrow ? 17 : 21;
    const rowH = narrow ? 14 : 16;
    const w = Math.min(narrow ? v.width - 16 : 340, v.width - 16);
    // A phone's canvas is short: one row under the caption (the line being typed, the test ticking).
    if (narrow && rows.length) rows = [rows.filter((r) => r.mark !== '○').pop() ?? rows[0]];
    ctx.font = `600 ${fs}px ${DISPLAY}`;
    const lines = wrap(ctx, text, w - pad * 2);
    const h = kh + pad + lines.length * lh + (rows.length ? 6 + rows.length * rowH : 0) + pad - 4;
    const node = v.nodes[nodeIdx];
    const a = v.anchor(nodeIdx);
    const x = narrow ? 8 : a && a.x > v.width / 2 ? 14 : v.width - w - 14;
    const y = narrow ? 8 : 14;
    const k = ease(appear);

    ctx.save();
    ctx.globalAlpha = k;
    if (inCanvas(v, a) && !(a!.x > x && a!.x < x + w && a!.y < y + h)) {
      ctx.beginPath();
      ctx.moveTo(a!.x < x ? x : a!.x > x + w ? x + w : a!.x, y + h);
      ctx.lineTo(a!.x, a!.y);
      ctx.strokeStyle = node.top;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.translate(x, y + (1 - k) * 8);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = node.top;
    ctx.fillRect(0, 0, w, kh);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, w, h);
    ctx.beginPath();
    ctx.moveTo(0, kh);
    ctx.lineTo(w, kh);
    ctx.stroke();
    ctx.fillStyle = node.top === '#FF5500' || node.top === '#FF3385' ? '#FFFFFF' : INK;
    ctx.font = `800 ${narrow ? 9.5 : 10.5}px ${MONO}`;
    ctx.fillText(fit(ctx, kicker, w - pad * 2), pad, kh - (narrow ? 5 : 7));
    ctx.fillStyle = INK;
    ctx.font = `600 ${fs}px ${DISPLAY}`;
    lines.forEach((l, i) => ctx.fillText(l, pad, kh + pad + i * lh + fs * 0.8));
    let ry = kh + pad + lines.length * lh + 6;
    ctx.font = `600 ${narrow ? 10 : 11}px ${MONO}`;
    for (const r of rows) {
      ctx.fillStyle = r.color;
      const mark = r.mark ? `${r.mark} ` : '';
      ctx.fillText(fit(ctx, mark + r.text, w - pad * 2), pad, ry + rowH * 0.75);
      ry += rowH;
    }
    ctx.restore();
    return { x, y, w, h };
  }

  /** A rubber stamp landing: big outlined mono text, slightly rotated, dropping from 1.6× scale. */
  function stamp(v: IsoView, text: string, color: string, cx: number, cy: number, t: number, id: string) {
    const { ctx } = v;
    const narrow = v.width < 520;
    const fs = narrow ? 15 : 22;
    const k = rm ? 1 : ease(t / 0.6);
    if (k >= 0.95 && landed !== id) {
      landed = id;
      api.shake(narrow ? 3 : 5);
    }
    ctx.save();
    ctx.font = `900 ${fs}px ${MONO}`;
    const tw = Math.min(ctx.measureText(text).width, v.width - 40);
    const w = tw + fs * 1.2;
    const h = fs * 1.9;
    const x = Math.max(w / 2 + 8, Math.min(v.width - w / 2 - 8, cx));
    ctx.translate(x, cy);
    ctx.rotate(-0.07);
    ctx.scale(1 + (1 - k) * 0.6, 1 + (1 - k) * 0.6);
    ctx.globalAlpha = Math.min(1, k * 1.4);
    ctx.fillStyle = 'rgba(11, 12, 16, 0.88)';
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.strokeRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 1, tw);
    ctx.restore();
  }

  /** The mini GR inside Sandbox: a paper tile (the letters are near-black), crisp pixels. */
  function drawTile(v: IsoView, a: Uint8Array | null, b: Uint8Array | null, mix: number, scale: number, label: string, cutY = -1) {
    const anchor = v.anchor(SANDBOX);
    if (!rec || !a || !inCanvas(v, anchor)) return;
    const { ctx } = v;
    const size = grab ? grab.w : Math.round(Math.max(56, Math.min(104, v.width * 0.14)) * scale);
    // Beside the node, clear of its label (centred on the anchor).
    const gap = v.width < 520 ? 44 : 60;
    const right = anchor!.x + gap + size < v.width - 8;
    // While a stroke is drawn the tile stays where the stroke started, whatever the shot does.
    tile = grab ?? {
      x: right ? anchor!.x + gap : anchor!.x - gap - size,
      y: Math.max(8, Math.min(v.height - size - 24, anchor!.y - size / 2 + 12)),
      w: size,
      h: size,
    };
    const { x, y } = tile;
    ctx.save();
    ctx.fillStyle = PAPER;
    ctx.fillRect(x, y, size, size);
    ctx.imageSmoothingEnabled = false;
    if (mix < 1) {
      ctx.globalAlpha = 1 - mix;
      ctx.drawImage(frameCanvas(a, rec.size), x, y, size, size);
    }
    if (b && mix > 0) {
      ctx.globalAlpha = mix;
      ctx.drawImage(frameCanvas(b, rec.size), x, y, size, size);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, size, size);
    if (cutY >= 0) {
      ctx.beginPath();
      ctx.moveTo(x + size / 2, y);
      ctx.lineTo(x + size / 2, y + size * cutY);
      ctx.strokeStyle = RED;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    if (stroke && stroke.length > 1) {
      ctx.beginPath();
      stroke.forEach(([u, w], i) => (i ? ctx.lineTo(x + u * size, y + w * size) : ctx.moveTo(x + u * size, y + w * size)));
      ctx.strokeStyle = RED;
      ctx.lineWidth = Math.max(3, size * BRUSH * 0.5);
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.6;
      ctx.stroke();
    }
    if (label) {
      ctx.globalAlpha = 1;
      ctx.font = `700 ${v.width < 520 ? 9 : 10}px ${MONO}`;
      ctx.fillStyle = MUTED;
      ctx.textAlign = right ? 'left' : 'right';
      ctx.fillText(fit(ctx, label, Math.max(size, v.width * 0.45)), right ? x : x + size, y + size + 13);
    }
    ctx.restore();
  }

  /** A dashed beam from one node to a point, drawn up to `t` (0..1). */
  function beam(v: IsoView, from: number, to: { x: number; y: number }, t: number, color: string) {
    const a = v.anchor(from);
    if (!a) return;
    const { ctx } = v;
    const k = rm ? 1 : Math.min(1, t);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(a.x + (to.x - a.x) * k, a.y + (to.y - a.y) * k);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.5;
    ctx.setLineDash([8, 5]);
    ctx.stroke();
    ctx.restore();
  }

  function camera(target: number | number[] | null, zoom: number, spot: number[]) {
    const key = JSON.stringify([target, zoom, spot]);
    if (key === camKey) return;
    camKey = key;
    api.aim(target, zoom, rm);
    api.spotlight(spot);
  }

  const kickerOf = (v: IsoView, i: number) => `${v.nodes[events[i].node].num} · ${v.nodes[events[i].node].short} · ${times[i]}`;
  const tileMid = () => (tile ? { x: tile.x + tile.w / 2, y: tile.y + tile.h / 2 } : null);

  function drawShot(v: IsoView, i: number, p: number) {
    const ev = events[i];
    const len = F.shots[i].end - F.shots[i].start;
    const since = (from: number) => (rm ? 1 : ((p - from) * len) / 350);
    const last = rec ? rec.frames.length - 1 : 0;
    const fr = (k: number) => rec?.frames[Math.max(0, Math.min(last, k))] ?? null;
    let rows: Row[] = [];
    let appearFrom = 0;

    if (ev.kind === 'plan') {
      if (p < ESTABLISH) return camera(null, 0.86, []);
      camera(PLAN, 1.22, [PLAN]);
      appearFrom = ESTABLISH;
    } else if (ev.kind === 'diff') {
      camera(BUILDER, 1.2, [BUILDER]);
      // The real diff lines stream in like typing.
      const lines = ev.lines ?? [];
      const total = lines.reduce((n, l) => n + l.length, 0);
      let chars = rm ? total : ((p - 0.1) / 0.75) * total;
      rows = lines.slice(0, v.width < 520 ? 3 : lines.length).flatMap((l) => {
        if (chars <= 0) return [];
        const shownText = l.slice(0, Math.max(0, Math.floor(chars)));
        chars -= l.length;
        return [{ text: shownText, color: '#2B3A55', mark: '+' }];
      });
    } else if (ev.kind === 'test') {
      camera(SANDBOX, 1.15, [SANDBOX]);
      rows = (ev.lines ?? []).map((l, k) => {
        const done = rm || p > 0.18 + k * 0.14;
        return { text: l, color: done ? OK : '#7A7A7A', mark: done ? '✓' : '○' };
      });
      drawTile(v, fr(0), null, 0, 1, '');
    } else if (ev.kind === 'catch') {
      if (p < REGROW_END) camera(SANDBOX, 1.22, [SANDBOX]);
      else camera([JUDGE, SANDBOX], 0.98, [JUDGE, SANDBOX]);
      const k = p < CUT_END ? 0 : p < REGROW_END ? 1 + Math.floor(((p - CUT_END) / (REGROW_END - CUT_END)) * last) : last;
      const step = rec && v.width >= 520 ? `${copy.step} ${rec.steps[Math.min(k, last)]}` : '';
      drawTile(v, fr(k), null, 0, 1.3, step, p < CUT_END ? p / CUT_END : k === 0 ? 1 : -1);
      const mid = tileMid();
      if (p >= REGROW_END && mid) beam(v, JUDGE, mid, (p - REGROW_END) / (STAMP_AT - REGROW_END), YELLOW);
      if (rec) {
        // Where these frames come from, in small print: they are a recording, not this page's model.
        const { ctx } = v;
        ctx.save();
        ctx.font = `500 ${v.width < 520 ? 9 : 10}px ${MONO}`;
        ctx.fillStyle = MUTED;
        const src = v.width < 520 ? [fit(ctx, rec.source, v.width - 24)] : wrap(ctx, rec.source, v.width - 24);
        src.forEach((l, n) => ctx.fillText(l, 12, v.height - 8 - (src.length - 1 - n) * 12));
        ctx.restore();
      }
    } else if (ev.kind === 'fix' && ev.node === SANDBOX) {
      camera(SANDBOX, 1.15, [SANDBOX]);
      rows = (ev.lines ?? []).map((l) => ({ text: l, color: BAD, mark: '✗' }));
      drawTile(v, fr(last), null, 0, 1, '');
    } else if (ev.kind === 'fix') {
      camera([BUILDER, SANDBOX], 1.0, [BUILDER, SANDBOX]);
      const mix = rm ? 1 : Math.max(0, Math.min(1, (p - HEAL_FROM) / (HEAL_TO - HEAL_FROM)));
      const prev = events.slice(0, i).reverse().find((e) => e.kind === 'fix' && e.lines);
      rows = (prev?.lines ?? []).map((l) => (mix >= 1 ? { text: l, color: OK, mark: '✓' } : { text: l, color: BAD, mark: '✗' }));
      drawTile(v, fr(last), fr(0), mix, 1, '');
    } else if (ev.kind === 'merge') {
      camera(null, 0.9, [PLAN]);
    }

    const box = caption(v, ev.node, kickerOf(v, i), ev.caption[lang], rows, since(appearFrom));
    if (ev.kind === 'plan' && p >= APPROVE_AT) {
      // Under the caption card, not on it.
      stamp(v, copy.approved, LIME, box.x + box.w - 90, box.y + box.h + (v.width < 520 ? 24 : 34), ((p - APPROVE_AT) * len) / 1000, `a${i}`);
    } else if (ev.kind === 'catch' && p >= STAMP_AT) {
      // Under the GR, or on a phone's short canvas just under the caption.
      const y = v.width < 520 ? box.y + box.h + 22 : Math.min(tile ? tile.y + tile.h + 40 : v.height * 0.62, v.height - 44);
      stamp(v, copy.caught, RED, v.width / 2, y, ((p - STAMP_AT) * len) / 1000, `c${i}`);
    } else if (ev.kind === 'merge' && p >= MERGE_AT) {
      stamp(v, copy.merged, LIME, v.width / 2, v.height * 0.62, ((p - MERGE_AT) * len) / 1000, `m${i}`);
    }
  }

  /** The visitor's run: the scene as they left the film, plus whatever they did. */
  function drawLive(v: IsoView, i: number) {
    const { ctx } = v;
    if (run) {
      camera(null, 0.9, run.judge ? [BUILDER, SANDBOX, JUDGE] : [BUILDER, SANDBOX, PLAN]);
    } else if (healing || shown === 'healed' || shown === 'unhealed') {
      // Not while the stroke is drawn: the tile must stay under the pointer.
      camera(SANDBOX, 1.2, [SANDBOX]);
    } else if (focusNode !== null) {
      camera(focusNode, 1.22, [focusNode]);
    }
    // The cut hint only when nothing else is going on: not over a fault run or the SHIPPED band.
    const label = run || liveFrame ? '' : copy.cutHint;
    drawTile(v, liveFrame ?? rec?.frames[0] ?? null, null, 0, 1.15, label);

    if (run) {
      // The fault walks Builder → Sandbox (the tests pass: it is a logic bug) → judge, or past it.
      const pr = run.ms / RUN_MS;
      const path = run.judge ? [BUILDER, SANDBOX] : [BUILDER, SANDBOX, PLAN];
      const legs = run.judge ? [[0, 0.35]] : [[0, 0.35], [0.5, 0.8]];
      let at: { x: number; y: number } | null = null;
      legs.forEach(([t0, t1], k) => {
        const a = v.anchor(path[k]);
        const b = v.anchor(path[k + 1]);
        if (!a || !b || pr < t0) return;
        const q = Math.min(1, (pr - t0) / (t1 - t0));
        at = { x: a.x + (b.x - a.x) * q, y: a.y + (b.y - a.y) * q };
      });
      const sb = v.anchor(SANDBOX);
      if (pr >= 0.35 && sb) {
        ctx.save();
        ctx.font = `800 ${v.width < 520 ? 9 : 10.5}px ${MONO}`;
        const tw = ctx.measureText(copy.testsGreen).width + 12;
        ctx.fillStyle = LIME;
        ctx.fillRect(sb.x - tw / 2, sb.y + 8, tw, 18);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sb.x - tw / 2, sb.y + 8, tw, 18);
        ctx.fillStyle = INK;
        ctx.textAlign = 'center';
        ctx.fillText(copy.testsGreen, sb.x, sb.y + 21);
        ctx.restore();
      }
      if (run.judge && pr >= 0.5 && sb) beam(v, JUDGE, sb, (pr - 0.5) / 0.15, YELLOW);
      if (run.judge && pr >= 0.75) {
        // Rolled back: the change goes back to the builder.
        const a = v.anchor(SANDBOX);
        const b = v.anchor(BUILDER);
        if (a && b) {
          const q = Math.min(1, (pr - 0.75) / 0.25);
          at = { x: a.x + (b.x - a.x) * q, y: a.y + (b.y - a.y) * q };
        }
      }
      if (at) {
        const { x, y } = at as { x: number; y: number };
        ctx.fillStyle = INK;
        ctx.fillRect(x - 7, y - 7, 14, 14);
        ctx.fillStyle = run.judge && pr >= 0.75 ? LIME : RED;
        ctx.fillRect(x - 5, y - 5, 10, 10);
      }
      const low = Math.min(tile ? tile.y + tile.h + 40 : v.height * 0.62, v.height - 30);
      if (run.judge && pr >= 0.68) stamp(v, copy.caught, RED, v.width / 2, low, ((pr - 0.68) * RUN_MS) / 1000, `run${gen}`);
      if (!run.judge && pr >= 0.8) {
        // Shipped: a red band across the scene. The explanation is in the caption, calmly.
        const k = rm ? 1 : ease(((pr - 0.8) * RUN_MS) / 300);
        if (k >= 0.95 && landed !== `ship${gen}`) {
          landed = `ship${gen}`;
          api.shake(4);
        }
        const h = v.width < 520 ? 34 : 46;
        const y = low - h / 2;
        ctx.save();
        ctx.globalAlpha = k;
        ctx.fillStyle = RED;
        ctx.fillRect(0, y, v.width, h);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `900 ${v.width < 520 ? 17 : 24}px ${MONO}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(copy.shipped, v.width / 2, y + h / 2 + 1);
        ctx.restore();
      }
    }

    // A fault run is scripted, and says so; the GR cut runs the real model, so it does not.
    const mode = run ? `${strings.yourRun} · ${strings.simulated}` : strings.yourRun;
    if (message) caption(v, messageNode, `${mode} · ${v.nodes[messageNode].num} · ${v.nodes[messageNode].short}`, message, [], 1);
    else caption(v, events[i].node, kickerOf(v, i), events[i].caption[lang], [], 1);
  }

  const guide: IsoGuide = {
    draw(v) {
      if (!started) {
        started = true;
        track({ action: 'replay' });
      }
      if (s.mode === 'replay' && !rm && !paused) s = tick(s, v.dt, F.length);
      if (run && !run.done) {
        run.ms += v.dt;
        if (run.ms >= RUN_MS) finishRun();
      }
      const { index, progress } = shotAt(F, s.t);
      if (s.mode === 'replay' && !landed.endsWith(String(index))) landed = '';
      paint();
      tile = null;
      if (s.mode === 'replay') drawShot(v, index, rm || still ? 0.999 : progress);
      else drawLive(v, index);
      return !rm;
    },
    node,
    fault,
    pointer(type, x, y) {
      if (type === 'down') {
        if (!tile || x < tile.x - 10 || x > tile.x + tile.w + 10 || y < tile.y - 10 || y > tile.y + tile.h + 10) return false;
        stroke = [];
        grab = { ...tile };
      }
      if (!stroke || !grab) return false;
      const pt: [number, number] = [
        Math.max(0, Math.min(1, (x - grab.x) / grab.w)),
        Math.max(0, Math.min(1, (y - grab.y) / grab.h)),
      ];
      if (type !== 'up') {
        const prev = stroke[stroke.length - 1];
        if (!prev || Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) > 0.03) stroke.push(pt);
        if (type === 'down') apply(takeover(s));
        else api.redraw();
        return true;
      }
      const st = [...stroke, pt];
      stroke = null;
      grab = null;
      const reach = st.reduce((n, q, k) => (k ? n + Math.hypot(q[0] - st[k - 1][0], q[1] - st[k - 1][1]) : 0), 0);
      if (reach >= 0.15) cutGR(st);
      else api.redraw();
      return true;
    },
  };

  // Explore takes the canvas: the film and the idle clock stop, and come back as they were.
  function attach() {
    if (window.getIsoDomain?.() !== 'yagni') window.setIsoDomain('yagni');
    camKey = '';
    attached = true;
    s = { ...s, idleMs: 0 };
    syncIdle();
    api.setGuide(guide);
    paint();
  }
  function detach() {
    attached = false;
    syncIdle();
    paint();
    api.setGuide(null);
    window.resetIsoCamera?.();
  }

  attach();
  paint();

  return {
    attach,
    detach,
    /** A control (or a timeline click at clientX `x`) the visitor used before this chunk had loaded. */
    handle(el: Element, x = 0) {
      if (el.matches('[data-sim-fault]')) fault();
      else if (el.matches('[data-sim-judge]')) judge();
      else if (el.matches('[data-replay-resume]')) back();
      else if (el.matches('[data-replay-pause]')) setPaused(!paused);
      else if (el.matches('[data-replay-timeline]')) scrub(stopAt(x));
    },
    /** A timeline key pressed before this chunk had loaded. */
    key,
  };
}
