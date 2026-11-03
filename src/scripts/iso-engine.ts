import { ISO_DOMAINS, type TopologyNode } from '../data/topology';
import { settleResidual, shouldKeepAnimating } from './iso-loop';

declare global {
  interface Window {
    updateIsoHudText: () => void;
    focusIsoNode: (idx: number) => void;
    stepIsoNode: (dir: number) => void;
    setIsoStratum: (stratum: 'all' | 1 | 0 | -1, btn?: HTMLElement | null) => void;
    resetIsoCamera: () => void;
    toggleIsoXray: (btn?: HTMLElement | null) => void;
    triggerIsoFault: (keepFocus?: boolean) => void;
    setIsoDomain: (domain: 'yagni' | 'voice' | 'saas', btn?: HTMLElement | null) => void;
    fireIsoPacket: () => void;
    playIso: () => void;
    clearIsoFault: () => void;
    getIsoDomain: () => 'yagni' | 'voice' | 'saas';
    openDomainBlueprint: () => void;
    openCaseBreakdown: (caseId: string) => void;
  }
}

interface ProjectedPoint {
  x: number;
  y: number;
  depth: number;
  scale: number;
}

interface NodeScreenBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  anchorX: number;
  anchorY: number;
  depth: number;
  isRelevant: boolean;
  isHighlighted: boolean;
}

export function initIsoArchitectureEngine(): void {
  const canvas = document.getElementById('iso-arch-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let currentDomain: 'yagni' | 'voice' | 'saas' = 'yagni';
  let selectedNode = 1; // 02 · AGENT CORE
  let lockedNode = -1;
  let hoveredNode = -1;
  let isXray = false;
  let activeStratum: 'all' | 1 | 0 | -1 = 'all';

  let camYaw = 0.64;
  let camPitch = 0.54;
  let targetYaw = 0.64;
  let targetPitch = 0.54;

  let camZoom = 0.86;
  let targetZoom = 0.86;

  let camFocusX = 0;
  let camFocusY = 8;
  let camFocusZ = 0;
  let targetFocusX = 0;
  let targetFocusY = 8;
  let targetFocusZ = 0;

  let isDragging = false;
  let touchDragDecided = false;
  let touchIsHorizontal = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragMoved = false;

  let clock = 0;
  let isCanvasVisible = true;
  let rafId: number | null = null;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Phones get a still poster: one frame per change, no rAF loop until Play (or a story step).
  const posterQuery = window.matchMedia('(max-width: 480px)');
  let playing = !posterQuery.matches;

  const traceWave = { active: false, progress: 0 };
  const faultSim = {
    active: false,
    progress: 0,
    targetIdx: 2,
    stage: 0
  };

  const nodeFlash = new Array<number>(8).fill(0);
  const nodeExplode = new Array<number>(8).fill(0);
  const nodeScreenCache = new Array<NodeScreenBounds | null>(8).fill(null);

  const edgePackets = Array.from({ length: 12 }, (_, i) => ({
    edgeIdx: i,
    t: (i * 0.23) % 1,
    speed: 0.0065 + (i % 3) * 0.002
  }));

  let width = 0;
  let height = 0;

  function resize() {
    if (!canvas || !canvas.parentElement || !ctx) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Resizing wipes the canvas; an idle loop has to draw it again.
    ensureLoopRunning();
  }
  resize();
  window.addEventListener('resize', resize);

  function project3D(wx: number, wy: number, wz: number): ProjectedPoint {
    const dx = wx - camFocusX;
    const dy = wy - camFocusY;
    const dz = wz - camFocusZ;

    const cosY = Math.cos(camYaw);
    const sinY = Math.sin(camYaw);
    const rx = dx * cosY - dz * sinY;
    const rz = dx * sinY + dz * cosY;

    const cosP = Math.cos(camPitch);
    const sinP = Math.sin(camPitch);
    const ry = dy * cosP - rz * sinP;
    const camDist = -(dy * sinP + rz * cosP);

    const fov = 1100;
    const persp = (fov / Math.max(340, fov + camDist)) * camZoom;

    return {
      x: width * 0.5 + rx * persp,
      y: height * 0.54 - ry * persp,
      depth: camDist,
      scale: persp
    };
  }

  function updateInspectorCard() {
    const card = document.getElementById('iso-inspector-card');
    if (!card) return;
    if (lockedNode < 0) {
      card.classList.remove('open');
      return;
    }

    const lang = (document.documentElement.getAttribute('data-lang') || 'en') as 'en' | 'ru';
    const node = ISO_DOMAINS[currentDomain].nodes[lockedNode];
    if (!node) return;

    card.classList.add('open');
    card.style.borderColor = node.top;

    const stratumNames: Record<string, { en: string; ru: string }> = {
      '1': { en: 'STRATUM L+1 · ORBITAL TELEMETRY (+74m)', ru: 'ЯРУС L+1 · ОРБИТАЛЬНЫЙ РАДАР (+74м)' },
      '0': { en: 'STRATUM L0 · CORE EXECUTION DECK (0m)', ru: 'ЯРУС L0 · ОСНОВНОЕ ЯДРО (0м)' },
      '-1': { en: 'STRATUM L-1 · SUBTERRANEAN VAULT (-68m)', ru: 'ЯРУС L-1 · ПОДЗЕМНЫЙ БУНКЕР (-68м)' }
    };

    const titleEl = document.getElementById('iso-insp-title');
    const subEl = document.getElementById('iso-insp-sub');
    const layersEl = document.getElementById('iso-insp-layers');
    const guardEl = document.getElementById('iso-insp-guard');

    if (titleEl) {
      titleEl.textContent = `${node.code}  [${node.metric}]`;
      titleEl.style.color = node.top;
    }
    if (subEl) {
      const st = stratumNames[String(node.stratum)];
      subEl.textContent = `${st ? st[lang] || st.en : ''} — ${node.spec[lang] || node.spec.en}`;
    }
    if (layersEl && node.layers) {
      layersEl.innerHTML = node.layers
        .map(
          (l) => `
          <div class="iso-insp-layer-item" style="border-left-color: ${node.top};">
            <strong style="color: ${node.top}; white-space: nowrap;">${l.tag}</strong>
            <span style="text-align: right; color: #D8D5CD;">${l.desc[lang] || l.desc.en}</span>
          </div>`
        )
        .join('');
    }
    if (guardEl && node.guard) {
      guardEl.textContent = node.guard[lang] || node.guard.en;
    }
  }

  window.updateIsoHudText = function () {
    const lang = (document.documentElement.getAttribute('data-lang') || 'en') as 'en' | 'ru';
    const activeIdx = hoveredNode >= 0 ? hoveredNode : lockedNode >= 0 ? lockedNode : selectedNode;
    const node = ISO_DOMAINS[currentDomain].nodes[activeIdx];
    if (!node) return;

    const badgeEl = document.getElementById('iso-hud-badge');
    const textEl = document.getElementById('iso-hud-text');
    if (badgeEl) {
      badgeEl.textContent = node.code;
      badgeEl.style.background = node.top;
      badgeEl.style.color = node.top === '#FF5500' || node.top === '#FF3385' ? '#FFFFFF' : '#0A0A0A';
    }
    if (textEl) {
      textEl.textContent = node.spec[lang] || node.spec.en;
    }

    updateInspectorCard();
  };

  window.focusIsoNode = function (idx: number) {
    const nodes = ISO_DOMAINS[currentDomain].nodes;
    if (!nodes[idx]) return;
    lockedNode = idx;
    selectedNode = idx;
    nodeFlash[idx] = 1.0;
    const n = nodes[idx];
    targetFocusX = n.x * 0.62;
    targetFocusY = n.baseY + n.h * 0.6;
    targetFocusZ = n.z * 0.62;
    targetZoom = 1.24;
    const statusEl = document.getElementById('iso-trace-status');
    if (statusEl) statusEl.textContent = '3D EXPLODED // ' + n.code;
    window.updateIsoHudText();
    ensureLoopRunning();
  };

  window.stepIsoNode = function (dir: number) {
    const nodes = ISO_DOMAINS[currentDomain].nodes;
    const base = lockedNode >= 0 ? lockedNode : selectedNode;
    const next = (base + dir + nodes.length) % nodes.length;
    window.focusIsoNode(next);
  };

  window.setIsoStratum = function (stratum: 'all' | 1 | 0 | -1, btn?: HTMLElement | null) {
    activeStratum = stratum;
    document.querySelectorAll('[data-stratum-btn]').forEach((b) => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    lockedNode = -1;
    if (stratum === 1) {
      targetFocusX = 0;
      targetFocusY = 82;
      targetFocusZ = -110;
      targetZoom = 1.08;
      targetPitch = 0.46;
    } else if (stratum === 0) {
      targetFocusX = 0;
      targetFocusY = 16;
      targetFocusZ = 0;
      targetZoom = 1.02;
      targetPitch = 0.56;
    } else if (stratum === -1) {
      targetFocusX = 80;
      targetFocusY = -58;
      targetFocusZ = 110;
      targetZoom = 1.12;
      targetPitch = 0.44;
    } else {
      targetFocusX = 0;
      targetFocusY = 8;
      targetFocusZ = 0;
      targetZoom = 0.86;
      targetPitch = 0.54;
    }
    window.updateIsoHudText();
    ensureLoopRunning();
  };

  window.resetIsoCamera = function () {
    lockedNode = -1;
    activeStratum = 'all';
    document.querySelectorAll('[data-stratum-btn]').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-stratum-btn') === 'all');
    });
    targetFocusX = 0;
    targetFocusY = 8;
    targetFocusZ = 0;
    targetZoom = 0.86;
    targetYaw = 0.64;
    targetPitch = 0.54;
    const statusEl = document.getElementById('iso-trace-status');
    if (statusEl) statusEl.textContent = '3 DECKS · CLICK ANY 3D NODE TO EXPLODE';
    window.updateIsoHudText();
    ensureLoopRunning();
  };

  window.toggleIsoXray = function (btn?: HTMLElement | null) {
    isXray = !isXray;
    if (btn) btn.classList.toggle('active', isXray);
    const statusEl = document.getElementById('iso-trace-status');
    if (statusEl) {
      statusEl.textContent = isXray ? 'CAD X-RAY WIREFRAME ACTIVE' : '3 DECKS · CLICK ANY 3D NODE TO EXPLODE';
    }
    ensureLoopRunning();
  };

  window.triggerIsoFault = function (keepFocus = false) {
    const target = lockedNode >= 0 ? lockedNode : 2;
    faultSim.active = true;
    faultSim.progress = 0;
    faultSim.targetIdx = target;
    faultSim.stage = 1;
    // A run that has to play out (fault, trace) needs the loop, poster or not.
    playing = true;

    const btn = document.getElementById('btn-iso-fault');
    if (btn) btn.classList.add('active');

    if (!keepFocus) {
      lockedNode = -1;
      targetFocusX = 0;
      targetFocusY = 8;
      targetFocusZ = 0;
      targetZoom = 0.88;
      updateInspectorCard();
    }
    ensureLoopRunning();
  };

  window.setIsoDomain = function (domain: 'yagni' | 'voice' | 'saas', btn?: HTMLElement | null) {
    if (!ISO_DOMAINS[domain]) return;
    currentDomain = domain;
    lockedNode = -1;
    selectedNode = 1;
    window.clearIsoFault();
    window.resetIsoCamera();
    document.querySelectorAll('[data-iso-domain]').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-iso-domain') === domain);
    });
    if (btn) btn.classList.add('active');

    // Sync URL query param without page jump
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('domain', domain);
      window.history.replaceState({}, '', url.toString());
    } catch {}

    window.fireIsoPacket();
    window.updateIsoHudText();
  };

  // Stop a fault run before it heals. The guided story listens for iso:aborted to leave "healing".
  window.clearIsoFault = function () {
    if (!faultSim.active) return;
    faultSim.active = false;
    document.getElementById('btn-iso-fault')?.classList.remove('active');
    window.dispatchEvent(new CustomEvent('iso:aborted'));
    ensureLoopRunning();
  };

  window.fireIsoPacket = function () {
    traceWave.active = true;
    traceWave.progress = 0;
    playing = true;
    const statusEl = document.getElementById('iso-trace-status');
    if (statusEl) statusEl.textContent = 'TRACING 3-DECK TOPOLOGY...';
    ensureLoopRunning();
  };

  window.playIso = function () {
    if (playing) return;
    playing = true;
    ensureLoopRunning();
  };
  // Growing past phone width: no Play button there, so start the loop.
  posterQuery.addEventListener?.('change', (e) => {
    if (!e.matches) window.playIso();
  });

  window.getIsoDomain = () => currentDomain;

  window.openDomainBlueprint = function () {
    window.openCaseBreakdown(ISO_DOMAINS[currentDomain].caseId);
  };

  function isNodeConnected(a: number, b: number): boolean {
    if (a === b) return true;
    const edges = ISO_DOMAINS[currentDomain].edges;
    for (let i = 0; i < edges.length; i++) {
      const [u, v] = edges[i];
      if ((u === a && v === b) || (u === b && v === a)) return true;
    }
    return false;
  }

  // Pointer & Touch Handling (Prevents Vertical Scroll Trap on Smartphones!)
  canvas.addEventListener('pointerdown', (e) => {
    isDragging = true;
    dragMoved = false;
    touchDragDecided = false;
    touchIsHorizontal = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    if (e.pointerType !== 'touch') {
      canvas.setPointerCapture(e.pointerId);
    }
    ensureLoopRunning();
  });

  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (isDragging) {
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;

      // On touch screens, allow natural vertical page scrolling if the user swipes vertically
      if (e.pointerType === 'touch') {
        if (!touchDragDecided && Math.hypot(dx, dy) > 6) {
          touchDragDecided = true;
          touchIsHorizontal = Math.abs(dx) > Math.abs(dy) * 1.1;
          if (!touchIsHorizontal) {
            isDragging = false;
            return;
          }
        }
        if (!touchIsHorizontal) return;
      }

      if (Math.hypot(dx, dy) > 4) dragMoved = true;
      targetYaw += dx * 0.0065;
      targetPitch = Math.max(0.28, Math.min(0.86, targetPitch + dy * 0.0045));
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      ensureLoopRunning();
      return;
    }

    let bestIdx = -1;
    let bestDepth = Infinity;
    for (let i = 0; i < nodeScreenCache.length; i++) {
      const sc = nodeScreenCache[i];
      if (!sc) continue;
      if (
        mx >= sc.minX - 10 &&
        mx <= sc.maxX + 10 &&
        my >= sc.minY - 26 &&
        my <= sc.maxY + 8
      ) {
        if (sc.depth < bestDepth) {
          bestDepth = sc.depth;
          bestIdx = i;
        }
      }
    }

    if (bestIdx !== hoveredNode) {
      hoveredNode = bestIdx;
      canvas.style.cursor = bestIdx >= 0 ? 'pointer' : 'grab';
      window.updateIsoHudText();
      ensureLoopRunning();
    }
  });

  canvas.addEventListener('pointerup', () => {
    if (!dragMoved && isDragging) {
      if (hoveredNode >= 0) {
        if (lockedNode === hoveredNode) {
          window.resetIsoCamera();
        } else {
          window.focusIsoNode(hoveredNode);
        }
      } else if (lockedNode >= 0) {
        window.resetIsoCamera();
      } else {
        window.fireIsoPacket();
      }
    }
    isDragging = false;
  });

  canvas.addEventListener('pointerleave', () => {
    isDragging = false;
    hoveredNode = -1;
    window.updateIsoHudText();
    ensureLoopRunning();
  });

  // Keyboard Accessibility on 3D Canvas
  canvas.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      window.stepIsoNode(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      window.stepIsoNode(-1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (lockedNode >= 0) window.resetIsoCamera();
      else window.focusIsoNode(selectedNode);
    } else if (e.key === 'Escape') {
      window.resetIsoCamera();
    } else if (e.key === 'f' || e.key === 'F') {
      window.triggerIsoFault();
    }
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      // Only zoom when Ctrl/Meta is held (or trackpad pinch gesture), letting normal page scroll pass through
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = -e.deltaY * 0.0025;
      targetZoom = Math.max(0.68, Math.min(1.6, targetZoom + delta));
      ensureLoopRunning();
    },
    { passive: false }
  );

  function drawPoly(
    pts: ProjectedPoint[],
    fill: string | null,
    stroke: string | null,
    lineWidth = 2.2
  ) {
    if (!ctx || pts.length === 0) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }

  function draw3DBox(
    cx: number,
    yBot: number,
    yTop: number,
    cz: number,
    hw: number,
    hd: number,
    colors: { top: string; left: string; right: string },
    alpha = 1.0,
    wireframeOnly = false
  ) {
    const cornersTop = [
      project3D(cx - hw, yTop, cz - hd),
      project3D(cx + hw, yTop, cz - hd),
      project3D(cx + hw, yTop, cz + hd),
      project3D(cx - hw, yTop, cz + hd)
    ];
    const cornersBot = [
      project3D(cx - hw, yBot, cz - hd),
      project3D(cx + hw, yBot, cz - hd),
      project3D(cx + hw, yBot, cz + hd),
      project3D(cx - hw, yBot, cz + hd)
    ];

    if (!ctx) return { cornersTop, cornersBot };

    ctx.save();
    ctx.globalAlpha = alpha;

    if (wireframeOnly || isXray) {
      const strokeCol = colors.top;
      drawPoly(cornersBot, 'rgba(16, 20, 30, 0.25)', strokeCol, 1.4);
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(cornersBot[i].x, cornersBot[i].y);
        ctx.lineTo(cornersTop[i].x, cornersTop[i].y);
        ctx.strokeStyle = strokeCol;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
      drawPoly(cornersTop, 'rgba(200, 255, 0, 0.12)', strokeCol, 1.8);
      ctx.restore();
      return { cornersTop, cornersBot };
    }

    const sinY = Math.sin(camYaw);
    const cosY = Math.cos(camYaw);

    const walls = [
      { idx: [0, 1], nx: 0, nz: -1, col: colors.right },
      { idx: [1, 2], nx: 1, nz: 0, col: colors.right },
      { idx: [2, 3], nx: 0, nz: 1, col: colors.left },
      { idx: [3, 0], nx: -1, nz: 0, col: colors.left }
    ];

    const visibleWalls: { pts: ProjectedPoint[]; col: string; depth: number }[] = [];
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      const facing = w.nx * sinY + w.nz * cosY;
      if (facing > -0.02) {
        const [a, b] = w.idx;
        const avgDepth =
          (cornersTop[a].depth + cornersTop[b].depth + cornersBot[a].depth + cornersBot[b].depth) * 0.25;
        visibleWalls.push({
          pts: [cornersTop[a], cornersTop[b], cornersBot[b], cornersBot[a]],
          col: w.col,
          depth: avgDepth
        });
      }
    }

    visibleWalls.sort((a, b) => b.depth - a.depth);
    visibleWalls.forEach((vw) => {
      drawPoly(vw.pts, vw.col, '#0A0A0A', 2.1);
    });

    drawPoly(cornersTop, colors.top, '#0A0A0A', 2.2);

    ctx.restore();
    return { cornersTop, cornersBot };
  }

  function drawSubterraneanVaultDeck() {
    if (!ctx) return;
    const vaultY = -68;
    const vRad = 250;
    const alpha = activeStratum === 'all' || activeStratum === -1 ? 1.0 : 0.22;

    ctx.save();
    ctx.globalAlpha = alpha;

    const vFL = project3D(-vRad, vaultY, vRad);
    const vFR = project3D(vRad, vaultY, vRad);
    const vBR = project3D(vRad, vaultY, -vRad);
    const vBL = project3D(-vRad, vaultY, -vRad);

    drawPoly([vFL, vFR, vBR, vBL], 'rgba(10, 12, 22, 0.92)', '#5E3DA8', 2.2);

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(179, 136, 255, 0.11)';
    for (let g = -vRad; g <= vRad; g += 50) {
      const p1 = project3D(g, vaultY, -vRad);
      const p2 = project3D(g, vaultY, vRad);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      const q1 = project3D(-vRad, vaultY, g);
      const q2 = project3D(vRad, vaultY, g);
      ctx.beginPath();
      ctx.moveTo(q1.x, q1.y);
      ctx.lineTo(q2.x, q2.y);
      ctx.stroke();
    }

    const corners = [
      [-vRad, -vRad],
      [vRad, -vRad],
      [vRad, vRad],
      [-vRad, vRad]
    ];
    corners.forEach(([cx, cz]) => {
      const cBot = project3D(cx, vaultY, cz);
      const cTop = project3D(cx, 0, cz);
      ctx.beginPath();
      ctx.moveTo(cBot.x, cBot.y);
      ctx.lineTo(cTop.x, cTop.y);
      ctx.strokeStyle = 'rgba(179, 136, 255, 0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    ctx.restore();
  }

  function drawMainDeckAndConduits(
    nodes: TopologyNode[],
    edges: [number, number][],
    focusIdx: number
  ) {
    if (!ctx) return;
    const gridRadius = 270;
    const step = 45;
    const deckAlpha = activeStratum === 'all' || activeStratum === 0 ? 1.0 : 0.35;

    ctx.save();
    ctx.globalAlpha = deckAlpha;

    const bFL = project3D(-gridRadius, 0, gridRadius);
    const bFR = project3D(gridRadius, 0, gridRadius);
    const bBR = project3D(gridRadius, 0, -gridRadius);
    const bBL = project3D(-gridRadius, 0, -gridRadius);

    drawPoly([bFL, bFR, bBR, bBL], 'rgba(14, 18, 27, 0.78)', '#3A435E', 2.5);

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    for (let g = -gridRadius; g <= gridRadius; g += step) {
      const p1 = project3D(g, 0, -gridRadius);
      const p2 = project3D(g, 0, gridRadius);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      const q1 = project3D(-gridRadius, 0, g);
      const q2 = project3D(gridRadius, 0, g);
      ctx.beginPath();
      ctx.moveTo(q1.x, q1.y);
      ctx.lineTo(q2.x, q2.y);
      ctx.stroke();
    }

    nodes.forEach((n) => {
      if (n.stratum === -1) {
        const hatchR = n.w + 8;
        const hPts = [
          project3D(n.x - hatchR, 0.5, n.z - hatchR),
          project3D(n.x + hatchR, 0.5, n.z - hatchR),
          project3D(n.x + hatchR, 0.5, n.z + hatchR),
          project3D(n.x - hatchR, 0.5, n.z + hatchR)
        ];
        drawPoly(hPts, 'rgba(8, 10, 16, 0.72)', n.top, 2.0);

        const shaftBot = project3D(n.x, n.baseY + n.h, n.z);
        const shaftTop = project3D(n.x, 2, n.z);
        ctx.beginPath();
        ctx.moveTo(shaftBot.x, shaftBot.y);
        ctx.lineTo(shaftTop.x, shaftTop.y);
        ctx.strokeStyle = n.top;
        ctx.lineWidth = 2.4;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

    const scanZ = ((clock * 1.4) % (gridRadius * 2)) - gridRadius;
    const swL = project3D(-gridRadius, 1, scanZ);
    const swR = project3D(gridRadius, 1, scanZ);
    ctx.beginPath();
    ctx.moveTo(swL.x, swL.y);
    ctx.lineTo(swR.x, swR.y);
    ctx.strokeStyle = 'rgba(200, 255, 0, 0.22)';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    ctx.restore();

    edges.forEach(([uIdx, vIdx], eIdx) => {
      const u = nodes[uIdx];
      const v = nodes[vIdx];
      const isRel = focusIdx === -1 || focusIdx === uIdx || focusIdx === vIdx;

      const uDeck = project3D(u.x, 2, u.z);
      const vDeck = project3D(v.x, 2, v.z);

      if (isRel) {
        ctx.beginPath();
        ctx.moveTo(uDeck.x, uDeck.y);
        ctx.lineTo(vDeck.x, vDeck.y);
        ctx.strokeStyle = '#0A0A0A';
        ctx.lineWidth = 4.5;
        ctx.stroke();
      }

      const isFaultEdge =
        faultSim.active &&
        faultSim.stage <= 3 &&
        (uIdx === faultSim.targetIdx || vIdx === faultSim.targetIdx);

      ctx.beginPath();
      ctx.moveTo(uDeck.x, uDeck.y);
      ctx.lineTo(vDeck.x, vDeck.y);
      ctx.strokeStyle = isFaultEdge
        ? '#FF2A55'
        : isRel
        ? focusIdx >= 0
          ? '#C8FF00'
          : 'rgba(0, 229, 255, 0.55)'
        : 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = isRel ? 2.2 : 1.1;
      ctx.stroke();

      if (isRel && !isFaultEdge) {
        const pkt = edgePackets[eIdx % edgePackets.length];
        const px = u.x + (v.x - u.x) * pkt.t;
        const pz = u.z + (v.z - u.z) * pkt.t;
        const py = (u.baseY + (v.baseY - u.baseY) * pkt.t) * 0.35 + 3;
        const sp = project3D(px, py, pz);
        ctx.fillStyle = '#0A0A0A';
        ctx.fillRect(sp.x - 4, sp.y - 4, 8, 8);
        ctx.fillStyle = focusIdx >= 0 ? '#C8FF00' : '#00E5FF';
        ctx.fillRect(sp.x - 2.5, sp.y - 2.5, 5, 5);
      }
    });
  }

  function drawArchitectureNodeBody(idx: number, node: TopologyNode, focusIdx: number) {
    if (!ctx) return;
    const isHovered = idx === hoveredNode;
    const isLocked = idx === lockedNode;
    const isSelected = idx === selectedNode && lockedNode === -1 && hoveredNode === -1;
    const isRelevant = focusIdx === -1 || isNodeConnected(focusIdx, idx);

    const stratumMatch = activeStratum === 'all' || activeStratum === node.stratum;
    const alpha = !stratumMatch ? 0.18 : isRelevant ? 1.0 : 0.28;

    const baseY = node.baseY;
    const lift = isHovered ? 6 : 0;
    const h = node.h + lift;
    const exp = nodeExplode[idx];

    const isFaultTarget = faultSim.active && idx === faultSim.targetIdx && faultSim.stage <= 4;

    if (node.stratum === 1) {
      const padR = node.w + 9;
      draw3DBox(
        node.x,
        baseY - 6,
        baseY,
        node.z,
        padR,
        padR,
        { top: '#1A2030', left: '#121622', right: '#0B0E17' },
        alpha,
        false
      );

      const pyTop = project3D(node.x, baseY - 6, node.z);
      const pyBot = project3D(node.x, 0, node.z);
      ctx.save();
      ctx.globalAlpha = alpha * 0.65;
      ctx.beginPath();
      ctx.moveTo(pyBot.x, pyBot.y);
      ctx.lineTo(pyTop.x, pyTop.y);
      ctx.strokeStyle = node.top;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    if (isHovered || isLocked || isSelected || isFaultTarget) {
      const r = node.w + 12 + Math.sin(clock * 0.09) * 2.5;
      const ringPts: ProjectedPoint[] = [];
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2 + clock * 0.025;
        ringPts.push(project3D(node.x + Math.cos(ang) * r, baseY + 1.2, node.z + Math.sin(ang) * r));
      }
      const ringCol = isFaultTarget ? '#FF2A55' : '#C8FF00';
      drawPoly(
        ringPts,
        isFaultTarget ? 'rgba(255, 42, 85, 0.22)' : 'rgba(200, 255, 0, 0.15)',
        ringCol,
        2.2
      );
    }

    const shPts = [
      project3D(node.x - node.w + 5, baseY + 0.4, node.z - node.d + 5),
      project3D(node.x + node.w + 5, baseY + 0.4, node.z - node.d + 5),
      project3D(node.x + node.w + 5, baseY + 0.4, node.z + node.d + 5),
      project3D(node.x - node.w + 5, baseY + 0.4, node.z + node.d + 5)
    ];
    drawPoly(shPts, 'rgba(0, 0, 0, 0.65)', null);

    const topCol = isFaultTarget
      ? Math.floor(clock / 6) % 2 === 0
        ? '#FF2A55'
        : '#FFD600'
      : nodeFlash[idx] > 0.25
      ? '#FFFFFF'
      : node.top;
    const palette = {
      top: topCol,
      left: isFaultTarget ? '#B8143A' : node.left,
      right: isFaultTarget ? '#7A0A24' : node.right
    };

    let baseBox: { cornersTop: ProjectedPoint[]; cornersBot: ProjectedPoint[] };
    let roofTopY = baseY + h + 8;

    if (exp > 0.04) {
      const sliceH = (h * 0.78) / 3;
      const gap = exp * 18;
      const totalExpH = sliceH * 3 + gap * 2;

      const rodCorners = [
        [-node.w * 0.75, -node.d * 0.75],
        [node.w * 0.75, -node.d * 0.75],
        [node.w * 0.75, node.d * 0.75],
        [-node.w * 0.75, node.d * 0.75]
      ];
      ctx.save();
      ctx.globalAlpha = alpha;
      rodCorners.forEach(([rx, rz]) => {
        const rBot = project3D(node.x + rx, baseY, node.z + rz);
        const rTop = project3D(node.x + rx, baseY + totalExpH + 6, node.z + rz);
        ctx.beginPath();
        ctx.moveTo(rBot.x, rBot.y);
        ctx.lineTo(rTop.x, rTop.y);
        ctx.strokeStyle = '#C8FF00';
        ctx.lineWidth = 1.8;
        ctx.stroke();
      });
      ctx.restore();

      let bBot: ProjectedPoint[] = [];
      let bTop: ProjectedPoint[] = [];
      for (let s = 0; s < 3; s++) {
        const y0 = baseY + s * (sliceH + gap);
        const y1 = y0 + sliceH;
        const slicePal =
          s === 2
            ? palette
            : s === 1
            ? { top: '#00E5FF', left: '#0099B8', right: '#00667A' }
            : { top: '#C8FF00', left: '#8FB800', right: '#5E7A00' };
        const sliceBox = draw3DBox(node.x, y0, y1, node.z, node.w, node.d, slicePal, alpha, false);
        if (s === 0) bBot = sliceBox.cornersBot;
        if (s === 2) bTop = sliceBox.cornersTop;

        if (exp > 0.45 && node.layers && node.layers[2 - s]) {
          const layerObj = node.layers[2 - s];
          const tagAnchor = project3D(node.x + node.w + 6, (y0 + y1) * 0.5, node.z - node.d);
          ctx.save();
          ctx.font = '800 10px "JetBrains Mono", monospace';
          const tw = ctx.measureText(layerObj.tag).width + 12;
          const th = 17;
          const tx = tagAnchor.x + 8;
          const ty = tagAnchor.y - th / 2;

          ctx.beginPath();
          ctx.moveTo(tagAnchor.x - 4, tagAnchor.y);
          ctx.lineTo(tx, tagAnchor.y);
          ctx.strokeStyle = slicePal.top;
          ctx.lineWidth = 1.6;
          ctx.stroke();

          ctx.fillStyle = '#0A0A0A';
          ctx.fillRect(tx + 2, ty + 2, tw, th);
          ctx.fillStyle = '#121622';
          ctx.fillRect(tx, ty, tw, th);
          ctx.strokeStyle = slicePal.top;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(tx, ty, tw, th);
          ctx.fillStyle = slicePal.top;
          ctx.fillText(layerObj.tag, tx + 6, ty + 12);
          ctx.restore();
        }
      }
      baseBox = { cornersTop: bTop, cornersBot: bBot };
      roofTopY = baseY + totalExpH + 14;
    } else {
      baseBox = draw3DBox(node.x, baseY, baseY + h, node.z, node.w, node.d, palette, alpha, false);

      if (node.type === 'reactor') {
        draw3DBox(
          node.x,
          baseY + h,
          baseY + h + 15,
          node.z,
          node.w * 0.55,
          node.d * 0.55,
          { top: '#FFFFFF', left: node.top, right: node.left },
          alpha,
          false
        );
        const haloPts: ProjectedPoint[] = [];
        const haloR = node.w * 1.15;
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + clock * 0.028;
          haloPts.push(
            project3D(node.x + Math.cos(a) * haloR, baseY + h + 20, node.z + Math.sin(a) * haloR)
          );
        }
        ctx.save();
        ctx.globalAlpha = alpha;
        drawPoly(haloPts, null, '#C8FF00', 2.0);
        ctx.restore();
        roofTopY = baseY + h + 24;
      } else if (node.type === 'cage') {
        const cageBoost = faultSim.active && faultSim.stage === 3 ? 4 : 0;
        draw3DBox(
          node.x,
          baseY,
          baseY + h + 6 + cageBoost,
          node.z,
          node.w + 5 + cageBoost,
          node.d + 5 + cageBoost,
          { top: '#00E5FF', left: '#00E5FF', right: '#00E5FF' },
          alpha * 0.82,
          true
        );
        roofTopY = baseY + h + 10;
      } else if (node.type === 'radar') {
        const mastTop = project3D(node.x, baseY + h + 18, node.z);
        const mastBot = project3D(node.x, baseY + h, node.z);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(mastBot.x, mastBot.y);
        ctx.lineTo(mastTop.x, mastTop.y);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2.4;
        ctx.stroke();

        const dishAngle = clock * (faultSim.active ? 0.14 : 0.045);
        const d1 = project3D(
          node.x + Math.cos(dishAngle) * 15,
          baseY + h + 18,
          node.z + Math.sin(dishAngle) * 15
        );
        const d2 = project3D(
          node.x - Math.cos(dishAngle) * 15,
          baseY + h + 18,
          node.z - Math.sin(dishAngle) * 15
        );
        ctx.beginPath();
        ctx.moveTo(d1.x, d1.y);
        ctx.lineTo(d2.x, d2.y);
        ctx.strokeStyle = faultSim.active ? '#FF2A55' : '#C8FF00';
        ctx.lineWidth = 3.0;
        ctx.stroke();
        ctx.restore();
        roofTopY = baseY + h + 22;
      } else if (node.type === 'tower') {
        draw3DBox(
          node.x,
          baseY + h,
          baseY + h + 6,
          node.z,
          node.w * 0.56,
          node.d * 0.56,
          { top: '#181B24', left: '#101218', right: '#0A0A0A' },
          alpha,
          false
        );
        roofTopY = baseY + h + 10;
      }
    }

    const allPts = [...baseBox.cornersTop, ...baseBox.cornersBot];
    const xs = allPts.map((p) => p.x);
    const ys = allPts.map((p) => p.y);
    const anchorPt = project3D(node.x, roofTopY, node.z);
    nodeScreenCache[idx] = {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
      anchorX: anchorPt.x,
      anchorY: anchorPt.y,
      depth: anchorPt.depth,
      isRelevant: isRelevant && stratumMatch,
      isHighlighted: isHovered || isLocked || isSelected || isFaultTarget || nodeFlash[idx] > 0.2
    };
  }

  function drawFaultSimulationFX(nodes: TopologyNode[]) {
    if (!ctx || !faultSim.active) return;
    const target = nodes[faultSim.targetIdx];
    const radar = nodes[7];
    const selfFix = nodes[6];
    const judge = nodes[3];
    if (!target || !radar || !selfFix) return;

    ctx.save();

    if (faultSim.stage <= 4) {
      const shockR = target.w + 10 + ((clock * 1.8) % 34);
      const sPts: ProjectedPoint[] = [];
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        sPts.push(
          project3D(target.x + Math.cos(a) * shockR, target.baseY + 2, target.z + Math.sin(a) * shockR)
        );
      }
      drawPoly(sPts, null, '#FF2A55', 2.4);
    }

    if (faultSim.stage >= 2 && faultSim.stage <= 4) {
      const rOrigin = project3D(radar.x, radar.baseY + radar.h + 18, radar.z);
      const tTop = project3D(target.x, target.baseY + target.h, target.z);
      const tL = project3D(target.x - target.w, target.baseY + target.h, target.z - target.d);
      const tR = project3D(target.x + target.w, target.baseY + target.h, target.z + target.d);

      drawPoly([rOrigin, tL, tR], 'rgba(255, 42, 85, 0.2)', '#FF2A55', 1.8);
      ctx.beginPath();
      ctx.moveTo(rOrigin.x, rOrigin.y);
      ctx.lineTo(tTop.x, tTop.y);
      ctx.strokeStyle = '#FFD600';
      ctx.lineWidth = 2.8;
      ctx.stroke();
    }

    if (faultSim.stage === 4) {
      const sfPt = project3D(selfFix.x, selfFix.baseY + selfFix.h, selfFix.z);
      const jPt = project3D(judge.x, judge.baseY + judge.h, judge.z);
      const tPt = project3D(target.x, target.baseY + target.h, target.z);

      ctx.beginPath();
      ctx.moveTo(sfPt.x, sfPt.y);
      ctx.lineTo(jPt.x, jPt.y);
      ctx.lineTo(tPt.x, tPt.y);
      ctx.strokeStyle = '#00E5FF';
      ctx.lineWidth = 3.2;
      ctx.stroke();
    }

    if (faultSim.stage === 5) {
      const healR = target.w + 26;
      const hPts: ProjectedPoint[] = [];
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        hPts.push(
          project3D(target.x + Math.cos(a) * healR, target.baseY + 4, target.z + Math.sin(a) * healR)
        );
      }
      drawPoly(hPts, 'rgba(200, 255, 0, 0.25)', '#C8FF00', 3.0);
    }

    ctx.restore();
  }

  function drawTopLayerLabels(nodes: TopologyNode[], focusIdx: number) {
    if (!ctx) return;
    ctx.font = '800 11px "JetBrains Mono", monospace';
    const boxes: {
      idx: number;
      node: TopologyNode;
      text: string;
      w: number;
      h: number;
      anchorX: number;
      anchorY: number;
      x: number;
      y: number;
      isHighlighted: boolean;
    }[] = [];

    nodes.forEach((node, idx) => {
      const sc = nodeScreenCache[idx];
      if (!sc) return;
      if (focusIdx >= 0 && !sc.isRelevant) return;
      if (activeStratum !== 'all' && node.stratum !== activeStratum) return;

      const text = `${node.num} · ${node.short}`;
      const tw = ctx.measureText(text).width + 16;
      const th = 21;

      boxes.push({
        idx,
        node,
        text,
        w: tw,
        h: th,
        anchorX: sc.anchorX,
        anchorY: sc.anchorY,
        x: sc.anchorX - tw / 2,
        y: sc.anchorY - th - 10,
        isHighlighted: sc.isHighlighted
      });
    });

    for (let iter = 0; iter < 6; iter++) {
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          const ox = Math.min(a.x + a.w + 10, b.x + b.w + 10) - Math.max(a.x, b.x);
          const oy = Math.min(a.y + a.h + 8, b.y + b.h + 8) - Math.max(a.y, b.y);
          if (ox > 0 && oy > 0) {
            if (oy < ox) {
              const pushY = oy / 2 + 1;
              if (a.y < b.y) {
                a.y -= pushY;
                b.y += pushY;
              } else {
                a.y += pushY;
                b.y -= pushY;
              }
            } else {
              const pushX = ox / 2 + 1;
              if (a.x < b.x) {
                a.x -= pushX;
                b.x += pushX;
              } else {
                a.x += pushX;
                b.x -= pushX;
              }
            }
          }
        }
      }
    }

    boxes.forEach((b) => {
      b.x = Math.max(12, Math.min(width - b.w - 12, b.x));
      b.y = Math.max(12, Math.min(height - b.h - 12, b.y));

      const isFault = faultSim.active && b.idx === faultSim.targetIdx && faultSim.stage <= 4;
      const pinX = b.x + b.w / 2;
      const pinY = b.y + b.h;

      ctx.beginPath();
      ctx.moveTo(b.anchorX, b.anchorY);
      ctx.lineTo(pinX, pinY);
      ctx.strokeStyle = isFault ? '#FF2A55' : b.isHighlighted ? '#C8FF00' : b.node.top;
      ctx.lineWidth = 1.8;
      ctx.stroke();

      ctx.fillStyle = '#000000';
      ctx.fillRect(b.x + 3, b.y + 3, b.w, b.h);

      ctx.fillStyle = isFault ? '#FF2A55' : b.isHighlighted ? b.node.top : '#0F121A';
      ctx.fillRect(b.x, b.y, b.w, b.h);

      if (!b.isHighlighted && !isFault) {
        ctx.fillStyle = b.node.top;
        ctx.fillRect(b.x, b.y, 4, b.h);
      }

      ctx.strokeStyle = isFault || b.isHighlighted ? '#0A0A0A' : b.node.top;
      ctx.lineWidth = 1.8;
      ctx.strokeRect(b.x, b.y, b.w, b.h);

      ctx.font = '800 11px "JetBrains Mono", monospace';
      ctx.fillStyle = isFault
        ? '#FFFFFF'
        : b.isHighlighted
        ? b.node.top === '#FF5500' || b.node.top === '#FF3385'
          ? '#FFFFFF'
          : '#0A0A0A'
        : '#FFFFFF';
      ctx.fillText(b.text, b.x + 9, b.y + 14.5);
    });
  }

  // Animation constants were tuned at 60 fps. `frames` scales each step by how many
  // 60 fps frames actually elapsed, so pacing stays the same at 120 Hz or under load.
  let lastFrameTs: number | null = null;
  const ease = (rate: number, frames: number) => 1 - Math.pow(1 - rate, frames);

  function render(ts: number) {
    if (!isCanvasVisible || document.hidden) {
      rafId = null;
      lastFrameTs = null;
      return;
    }

    const frames = lastFrameTs === null ? 1 : Math.min((ts - lastFrameTs) / (1000 / 60), 4);
    lastFrameTs = ts;
    clock += frames;

    if (!isDragging && lockedNode === -1 && !faultSim.active && !prefersReducedMotion) {
      targetYaw += Math.sin(clock * 0.006) * 0.0004 * frames;
    }

    const camEase = ease(0.12, frames);
    camYaw += (targetYaw - camYaw) * camEase;
    camPitch += (targetPitch - camPitch) * camEase;
    camZoom += (targetZoom - camZoom) * camEase;
    camFocusX += (targetFocusX - camFocusX) * camEase;
    camFocusY += (targetFocusY - camFocusY) * camEase;
    camFocusZ += (targetFocusZ - camFocusZ) * camEase;

    ctx?.clearRect(0, 0, width, height);

    const domainObj = ISO_DOMAINS[currentDomain];
    const nodes = domainObj.nodes;
    const edges = domainObj.edges;

    for (let i = 0; i < nodes.length; i++) {
      const targetExp = lockedNode === i ? 1.0 : 0.0;
      nodeExplode[i] += (targetExp - nodeExplode[i]) * ease(0.14, frames);
      nodeFlash[i] *= Math.pow(0.9, frames);
    }

    if (faultSim.active) {
      faultSim.progress += 0.0042 * frames;
      const p = faultSim.progress;
      const statusEl = document.getElementById('iso-trace-status');
      if (p < 0.22) {
        faultSim.stage = 1;
        if (statusEl) statusEl.textContent = 'STAGE 1/5 · FAULT INJECTED ON ' + nodes[faultSim.targetIdx].short;
      } else if (p < 0.45) {
        faultSim.stage = 2;
        nodeFlash[7] = 0.8;
        if (statusEl) statusEl.textContent = 'STAGE 2/5 · ORBITAL RADAR (08) LOCKED STALLED RUN';
      } else if (p < 0.68) {
        faultSim.stage = 3;
        nodeFlash[4] = 0.8;
        nodeFlash[5] = 0.8;
        if (statusEl) statusEl.textContent = 'STAGE 3/5 · SUB-VAULT (05/06) BLAST RADIUS ISOLATED';
      } else if (p < 0.88) {
        faultSim.stage = 4;
        nodeFlash[6] = 0.9;
        nodeFlash[3] = 0.9;
        if (statusEl) statusEl.textContent = 'STAGE 4/5 · SELF-FIX (07) + JUDGE (04) ROOT-CAUSE PATCH';
      } else if (p < 1.0) {
        faultSim.stage = 5;
        nodeFlash[faultSim.targetIdx] = 1.0;
        if (statusEl) statusEl.textContent = 'STAGE 5/5 · RECOVERED & VERIFIED ACROSS ALL 3 DECKS';
      } else {
        faultSim.active = false;
        document.getElementById('btn-iso-fault')?.classList.remove('active');
        if (statusEl) statusEl.textContent = 'INCIDENT RESOLVED · ZERO CUSTOMER IMPACT';
        // The guided story waits for this to show its case link.
        window.dispatchEvent(new CustomEvent('iso:healed'));
      }
    }

    if (traceWave.active) {
      traceWave.progress += 0.015 * frames;
      const activeNodeIdx = Math.min(nodes.length - 1, Math.floor(traceWave.progress * nodes.length));
      nodeFlash[activeNodeIdx] = 1.0;
      selectedNode = activeNodeIdx;
      window.updateIsoHudText();

      if (traceWave.progress >= 1.0) {
        traceWave.active = false;
        const statusEl = document.getElementById('iso-trace-status');
        if (statusEl) statusEl.textContent = 'TRACE COMPLETE · ALL 3 DECKS HEALTHY';
      }
    }

    const focusIdx = hoveredNode >= 0 ? hoveredNode : lockedNode;

    drawSubterraneanVaultDeck();
    nodes
      .map((n, i) => ({ i, n, depth: project3D(n.x, n.baseY + n.h * 0.5, n.z).depth }))
      .filter((item) => item.n.stratum === -1)
      .sort((a, b) => b.depth - a.depth)
      .forEach(({ i }) => drawArchitectureNodeBody(i, nodes[i], focusIdx));

    drawMainDeckAndConduits(nodes, edges, focusIdx);
    nodes
      .map((n, i) => ({ i, n, depth: project3D(n.x, n.baseY + n.h * 0.5, n.z).depth }))
      .filter((item) => item.n.stratum === 0)
      .sort((a, b) => b.depth - a.depth)
      .forEach(({ i }) => drawArchitectureNodeBody(i, nodes[i], focusIdx));

    nodes
      .map((n, i) => ({ i, n, depth: project3D(n.x, n.baseY + n.h * 0.5, n.z).depth }))
      .filter((item) => item.n.stratum === 1)
      .sort((a, b) => b.depth - a.depth)
      .forEach(({ i }) => drawArchitectureNodeBody(i, nodes[i], focusIdx));

    drawFaultSimulationFX(nodes);
    drawTopLayerLabels(nodes, focusIdx);

    if (!prefersReducedMotion || traceWave.active || faultSim.active) {
      edgePackets.forEach((p) => {
        p.t = (p.t + p.speed * frames) % 1;
      });
    }

    const residual = settleResidual(
      [
        [camYaw, targetYaw],
        [camPitch, targetPitch],
        [camZoom, targetZoom],
        [camFocusX, targetFocusX],
        [camFocusY, targetFocusY],
        [camFocusZ, targetFocusZ]
      ],
      nodeExplode.slice(0, nodes.length),
      nodeFlash.slice(0, nodes.length),
      lockedNode
    );
    if (
      playing &&
      shouldKeepAnimating({
        reducedMotion: prefersReducedMotion,
        dragging: isDragging,
        traceActive: traceWave.active,
        faultActive: faultSim.active,
        residual
      })
    ) {
      rafId = requestAnimationFrame(render);
    } else {
      rafId = null;
      lastFrameTs = null;
    }
  }

  function ensureLoopRunning() {
    if (rafId === null && isCanvasVisible && !document.hidden) {
      rafId = requestAnimationFrame(render);
    }
  }

  // Pause 3D render loop when canvas is scrolled offscreen or tab is hidden
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        isCanvasVisible = entry.isIntersecting;
        if (isCanvasVisible) {
          ensureLoopRunning();
        }
      });
    },
    { threshold: 0.05 }
  );
  observer.observe(canvas);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && isCanvasVisible) {
      ensureLoopRunning();
    }
  });

  // A ?domain= deep link is applied by the guided story when Explore opens (topology-story-dom.ts):
  // the card always opens on the YAGNI story, so nothing switches after first paint.

  window.updateIsoHudText();
  ensureLoopRunning();
}
