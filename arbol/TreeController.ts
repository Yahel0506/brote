/**
 * Controlador del árbol. Cada método público cambia el estado del árbol y
 * dispara las animaciones correspondientes en el SVG al que esté conectado.
 *
 *   const tree = new TreeController({ seed: 7 });
 *   tree.grow();        // una decisión más
 *   tree.goState(4);    // saltar a "Ramas secundarias"
 *   tree.dry();         // final: hojas caen, el árbol se seca
 *   tree.reset();       // vuelve al brote
 *
 * Puede usarse antes de montar el componente: el estado se guarda y se
 * reproduce al conectarse con attach().
 */
import {
  Branch, F, LEAF_D, Leaf, MILESTONES, STAGE_NAMES, StageName, TOTAL_STEPS, TreeModel,
  DRY_STAGE_INDEX, SPROUT_G, branchWidth, buildModel, easeInOut, gTarget, limbD,
} from "./model";

export type CameraMode = "follow" | "full";
export type TreeLayout = "center" | "right" | "left";

export interface TreeState {
  step: number;
  totalSteps: number;
  stageIndex: number;
  stage: StageName;
  dry: boolean;
  seed: number;
  cameraMode: CameraMode;
  layout: TreeLayout;
  visibleLeaves: number;
  canGrow: boolean;
  canGoBack: boolean;
}

export interface TreeControllerOptions {
  seed?: number;
  cameraMode?: CameraMode;
  layout?: TreeLayout;
  /** si no se indica, se respeta prefers-reduced-motion */
  reducedMotion?: boolean;
}

/** Elementos del DOM que el componente entrega al controlador */
export interface TreeElements {
  wrap: HTMLElement;
  svg: SVGSVGElement;
  soil: SVGGElement;
  roots: SVGGElement;
  ground: SVGGElement;
  branches: SVGGElement;
  leaves: SVGGElement;
}

interface ViewBox { x: number; y: number; w: number; h: number }
interface Tween { obj: Branch; to: number; dur: number; t0: number; from: number | null }

const NS = "http://www.w3.org/2000/svg";
const PI = Math.PI;
const SPROUT_BOX: ViewBox = { x: -40, y: -44, w: 80, h: 80 };
const LAYOUT_TRANSFORM: Record<TreeLayout, string> = {
  center: "translateX(0%)",
  right: "translateX(22%)",
  left: "translateX(-22%)",
};
export const TREE_CLASS = {
  sil: "arbol-sil", gline: "arbol-gline", soil: "arbol-soil",
  fall: "arbol-fall", grow: "arbol-grow", leaf: "arbol-lf", dry: "arbol-dry",
} as const;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

export class TreeController {
  private seed: number;
  private step = 0;
  private isDry = false;
  private camMode: CameraMode;
  private layout: TreeLayout;
  private reduceOpt?: boolean;
  private reduce = false;

  private M: TreeModel | null = null;
  private els: TreeElements | null = null;
  private cam: ViewBox = { ...SPROUT_BOX };
  private camRaf = 0;
  private rafId = 0;
  private running = false;
  private lastT = 0;
  private tweens: Tween[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];

  private listeners = new Set<() => void>();
  private snapshot: TreeState;

  constructor(opts: TreeControllerOptions = {}) {
    this.seed = opts.seed ?? 7;
    this.camMode = opts.cameraMode ?? "follow";
    this.layout = opts.layout ?? "center";
    this.reduceOpt = opts.reducedMotion;
    this.snapshot = this.makeSnapshot();
  }

  /* =========================================================
     API pública: estado
     ========================================================= */

  /** Suscripción a cambios (compatible con useSyncExternalStore) */
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  /** Instantánea inmutable del estado actual */
  getState = (): TreeState => this.snapshot;

  /* =========================================================
     API pública: acciones
     ========================================================= */

  /** Crece una decisión (un nivel nuevo de ramas) */
  grow = (): void => this.goStep(this.isDry ? this.step : this.step + 1);

  /** Deshace el último paso (las ramas se retraen) */
  back = (): void => this.goStep(this.step - 1);

  /** Va a un paso concreto, 0..15 */
  goStep = (n: number): void => {
    n = Math.max(0, Math.min(TOTAL_STEPS, Math.round(n)));
    if (!this.M) { this.step = n; this.isDry = false; this.emit(); return; }
    this.clearTimers();
    const wasDry = this.isDry;
    if (wasDry) this.undry();
    if (n === this.step && !wasDry) return;
    const prev = this.step;
    this.step = n;
    this.apply(prev, n);
    this.camera();
    this.emit();
  };

  /** Va a un estado: 0 Brote … 6 Árbol desarrollado, 7 Árbol seco */
  goState = (i: number): void => {
    if (i >= DRY_STAGE_INDEX) this.dry();
    else this.goStep(MILESTONES[Math.max(0, i)]);
  };

  /** Final: crece lo que falte, las hojas caen y la madera se apaga */
  dry = (): void => {
    if (this.isDry) return;
    if (!this.M) { this.step = TOTAL_STEPS; this.isDry = true; this.emit(); return; }
    this.clearTimers();
    let wait = 0;
    if (this.step < TOTAL_STEPS) {
      const prev = this.step;
      this.step = TOTAL_STEPS;
      wait = this.apply(prev, this.step) + 500;
      this.camera();
      this.emit();
    }
    this.later(() => {
      this.isDry = true;
      this.fallLeaves();
      this.camera(3600);
      this.emit();
      this.later(() => this.els?.svg.classList.add(TREE_CLASS.dry), this.reduce ? 0 : 2400);
    }, wait);
  };

  /** Vuelve al brote: las ramas se retraen de la punta hacia el tronco */
  reset = (): void => {
    if (!this.M) { this.step = 0; this.isDry = false; this.emit(); return; }
    this.clearTimers();
    if (this.isDry) this.undry();
    const prev = this.step;
    this.step = 0;
    this.apply(prev, 0);
    this.camera();
    this.emit();
  };

  /** Genera otro árbol; si no se pasa semilla, se elige una al azar */
  setSeed = (seed?: number): void => {
    this.seed = seed ?? 1 + Math.floor(Math.random() * 9999);
    if (!this.els) { this.emit(); return; }
    this.rebuild(this.step, false);
  };

  /** "follow": la cámara sigue el crecimiento; "full": muestra todo el árbol */
  setCameraMode = (mode: CameraMode): void => {
    this.camMode = mode;
    if (this.M) this.camera();
    this.emit();
  };

  /** Posición del árbol dentro de su contenedor */
  setLayout = (layout: TreeLayout): void => {
    this.layout = layout;
    this.applyLayout();
    this.emit();
  };

  /* =========================================================
     Conexión con el DOM (la usa el componente)
     ========================================================= */

  attach(els: TreeElements): void {
    if (this.els) this.detach();
    this.els = els;
    this.reduce = this.reduceOpt ??
      (typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    this.mountGround();
    this.applyLayout();
    this.rebuild(this.step, this.isDry);
  }

  detach(): void {
    this.clearTimers();
    cancelAnimationFrame(this.camRaf);
    cancelAnimationFrame(this.rafId);
    this.running = false;
    this.tweens.length = 0;
    if (this.M) [...this.M.leaves, this.M.sproutLeaf].forEach((l) => l.anim?.cancel());
    if (this.els) {
      const { soil, roots, ground, branches, leaves, svg } = this.els;
      [soil, roots, ground, branches, leaves].forEach((g) => g.replaceChildren());
      svg.classList.remove(TREE_CLASS.dry);
    }
    this.els = null;
    this.M = null;
  }

  /* =========================================================
     Interno
     ========================================================= */

  private emit(): void {
    this.snapshot = this.makeSnapshot();
    this.listeners.forEach((fn) => fn());
  }

  private makeSnapshot(): TreeState {
    const stageIndex = this.stageIndex();
    return {
      step: this.step,
      totalSteps: TOTAL_STEPS,
      stageIndex,
      stage: STAGE_NAMES[stageIndex],
      dry: this.isDry,
      seed: this.seed,
      cameraMode: this.camMode,
      layout: this.layout,
      visibleLeaves: this.M ? this.M.leaves.filter((l) => l.shown).length : 0,
      canGrow: this.step < TOTAL_STEPS || this.isDry,
      canGoBack: this.step > 0,
    };
  }

  private stageIndex(): number {
    if (this.isDry) return DRY_STAGE_INDEX;
    let i = 0;
    MILESTONES.forEach((m, k) => { if (m <= this.step) i = k; });
    return i;
  }

  private later(fn: () => void, ms: number): void { this.timers.push(setTimeout(fn, ms)); }
  private clearTimers(): void { this.timers.forEach(clearTimeout); this.timers = []; }

  private rebuild(target: number, wantDry: boolean): void {
    this.clearTimers();
    cancelAnimationFrame(this.camRaf);
    this.tweens.length = 0;
    if (this.M) [...this.M.leaves, this.M.sproutLeaf].forEach((l) => l.anim?.cancel());
    this.isDry = false;
    this.step = 0;
    this.M = buildModel(this.seed);
    this.mount();
    this.cam = { ...SPROUT_BOX };
    this.setVB(this.cam);
    this.sprout();
    this.emit();
    if (target > 0 || wantDry) {
      this.later(() => {
        if (target > 0) { this.step = target; this.apply(0, target); this.camera(); this.emit(); }
        if (wantDry) this.dry();
      }, this.reduce ? 0 : 2600);
    }
  }

  private applyLayout(): void {
    if (this.els) this.els.wrap.style.transform = LAYOUT_TRANSFORM[this.layout];
  }

  /* ---------- DOM ---------- */
  private mountGround(): void {
    const { ground, soil } = this.els!;
    ground.replaceChildren(); soil.replaceChildren();
    let a = 3;
    const R = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    let d = "M-3000 0";
    for (let x = -600; x <= 600; x += Math.abs(x) < 70 ? 5 : 30) d += `L${x} ${F((R() - 0.5) * (Math.abs(x) < 70 ? 0.7 : 1.4))}`;
    d += "L3000 0";
    el("path", { d, class: TREE_CLASS.gline }, ground);
    // terrones, cáscara de semilla y briznas
    for (let i = 0; i < 11; i++) {
      const x = (R() < 0.5 ? -1 : 1) * (5 + R() * 34), y = 0.5 + R() * 2.2, r = 0.35 + R() * 0.7;
      const pts = [0, 1, 2, 3, 4].map((k) => {
        const an = (k / 5) * 2 * PI + R() * 0.6, rr = r * (0.6 + R() * 0.6);
        return F(x + Math.cos(an) * rr) + " " + F(y + Math.sin(an) * rr);
      });
      el("path", { d: "M" + pts.join("L") + "Z", class: TREE_CLASS.sil }, ground);
    }
    el("path", { d: "M-8.6 1.6C-8.4 -0.6 -6 -1.6 -3.6 -0.4L-4.6 0.6C-6.2 0.1 -7.4 0.6 -7.6 1.9Z", class: TREE_CLASS.sil }, ground);
    el("path", { d: "M2.6 1.2C4.2 0.1 6.6 0.4 7.6 1.9L6.3 2.2C5.6 1.4 4.3 1.2 3.4 1.9Z", class: TREE_CLASS.sil }, ground);
    [-27, -16, 19, 31].forEach((x) => {
      const h = 1.1 + R() * 1.4, lean = (R() - 0.5) * 1.6;
      el("path", { d: `M${F(x - 0.35)} 0.2L${F(x + lean)} ${F(-h)}L${F(x + 0.35)} 0.2Z`, class: TREE_CLASS.sil }, ground);
    });
    for (let i = 0; i < 18; i++) {
      const x = (R() - 0.5) * 90, y = 3 + R() * 26, l = 0.8 + R() * 2;
      el("path", { d: `M${F(x)} ${F(y)}l${F(l)} ${F((R() - 0.5) * 0.5)}`, class: TREE_CLASS.soil }, soil);
    }
  }

  private mount(): void {
    const { branches, roots, leaves, svg } = this.els!;
    const M = this.M!;
    branches.replaceChildren(); roots.replaceChildren(); leaves.replaceChildren();
    svg.classList.remove(TREE_CLASS.dry);
    M.br.forEach((b) => { b.el = el("path", { d: "", class: TREE_CLASS.sil }, branches); });
    M.roots.forEach((b) => { b.el = el("path", { d: "", class: TREE_CLASS.sil }, roots); });
    [...M.leaves, M.sproutLeaf].forEach((l) => {
      const fall = el("g", { class: TREE_CLASS.fall }, leaves);
      const pos = el("g", { transform: `translate(${F(l.x)} ${F(l.y)}) rotate(${F((l.rot * 180) / PI)}) scale(${F(l.scale)})` }, fall);
      const grow = el("g", { class: TREE_CLASS.grow }, pos);
      el("path", { d: LEAF_D, class: TREE_CLASS.leaf }, grow);
      l.fall = fall;
      l.grow = grow;
    });
  }

  /* ---------- motor de animación (rAF) ---------- */
  private tween(obj: Branch, to: number, dur: number, delay: number): void {
    for (let i = this.tweens.length - 1; i >= 0; i--) if (this.tweens[i].obj === obj) this.tweens.splice(i, 1);
    this.tweens.push({ obj, to, dur: Math.max(1, dur), t0: performance.now() + delay, from: null });
    this.kick();
  }

  private kick(): void {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  private loop = (now: number): void => {
    if (!this.M) { this.running = false; return; }
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    let active = false, dirty = false;
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const t = this.tweens[i];
      if (now < t.t0) { active = true; continue; }
      if (t.from === null) t.from = t.obj.g;
      const k = Math.min(1, (now - t.t0) / t.dur);
      t.obj.g = t.from + (t.to - t.from) * easeInOut(k);
      dirty = true;
      if (k >= 1) this.tweens.splice(i, 1); else active = true;
    }
    for (const b of this.M.all) {
      const d = b.thT - b.th;
      if (Math.abs(d) > 0.0005) { b.th += d * Math.min(1, dt * (this.reduce ? 60 : 1.8)); dirty = active = true; }
      else if (d !== 0) { b.th = b.thT; dirty = true; }
    }
    if (dirty) this.redraw();
    if (active) this.rafId = requestAnimationFrame(this.loop);
    else this.running = false;
  };

  private redraw(): void {
    const M = this.M!;
    for (const b of M.all) b.w = branchWidth(b);
    for (const b of M.all) {
      const d = b.isCont ? "" : limbD(b);
      if (d !== b.lastD) { b.el!.setAttribute("d", d); b.lastD = d; }
    }
  }

  /* ---------- hojas ---------- */
  private showLeaf(l: Leaf, delay: number): void {
    const g = l.grow!;
    getComputedStyle(g).transform;   // fija el estado inicial para que la transición ocurra
    g.style.transition = `transform ${this.reduce ? 1 : 1300}ms cubic-bezier(.3,0,.2,1) ${delay}ms, opacity ${this.reduce ? 1 : 350}ms ease ${delay}ms`;
    g.style.transform = "scale(1) rotate(0deg)";
    g.style.opacity = "1";
    l.shown = true;
  }

  private hideLeaf(l: Leaf, delay: number): void {
    const g = l.grow!;
    g.style.transition = `transform 450ms ease ${delay}ms, opacity 450ms ease ${delay}ms`;
    g.style.transform = "scale(.001) rotate(-35deg)";
    g.style.opacity = "0";
    l.shown = false;
  }

  /* ---------- transición entre pasos; devuelve su duración (ms) ---------- */
  private apply(prev: number, next: number): number {
    const M = this.M!, reduce = this.reduce;
    const levels = Math.abs(next - prev);
    const gs = Math.max(0.45, Math.min(1, 9000 / (1800 + 1250 * levels)));   // saltos largos, algo más rápidos
    const RET = Math.max(250, Math.min(650, 4500 / Math.max(1, levels)));
    const start: Record<number, number> = {};
    let acc = 0;
    for (let d = prev; d < next; d++) { start[d] = acc; acc += (d === 0 ? 1800 : 1250) * gs; }

    const timing = new Map<Branch, { delay: number; dur: number; grow: boolean }>();
    let last = 0;
    for (const b of M.all) {
      const tgt = gTarget(b, next);
      if (tgt === b.gT) continue;
      let delay: number, dur: number;
      if (tgt > b.gT) {
        if (b.root) { delay = 200 + b.depth * 450; dur = 1500; }
        else { delay = (start[b.depth] || 0) + (b.fromTip ? 0 : 220); dur = (b.depth === 0 ? 1800 : 1250) * gs; }
      } else {
        delay = b.root ? Math.max(0, prev - 1) * RET + (2 - b.depth) * 150 : Math.max(0, prev - 1 - b.depth) * RET;
        dur = RET;
      }
      if (reduce) { delay = 0; dur = 1; }
      b.gT = tgt;
      this.tween(b, tgt, dur, delay);
      timing.set(b, { delay, dur, grow: tgt > 0.5 });
      last = Math.max(last, delay + dur);
    }

    // engrosamiento: más ramas visibles encima, más madera abajo
    const cnt = new Map<Branch, number>();
    for (let i = M.br.length - 1; i >= 0; i--) {
      const b = M.br[i];
      let c = 0;
      if (gTarget(b, next) > 0) for (const k of b.kids) if (gTarget(k, next) > 0) c += 1 + (cnt.get(k) || 0);
      cnt.set(b, c);
      b.thT = 1 + 0.17 * Math.log2(1 + c);
    }
    if (next === 0) M.br[0].thT = 0.7;                       // el brote es delgado
    M.roots.forEach((r) => { r.thT = r.group === "tree" ? 1 + 0.9 * Math.min(1, next / 10) : 1; });
    this.kick();

    M.leaves.forEach((l) => {
      const want = !this.isDry && gTarget(l.b!, next) > 0 && (!l.lush || next === TOTAL_STEPS);
      const t = timing.get(l.b!);
      if (want && !l.shown) this.showLeaf(l, reduce ? 0 : t && t.grow ? t.delay + t.dur * l.t * 0.9 + 200 + l.j * 500 : 300 + l.j * 1200);
      else if (!want && l.shown) this.hideLeaf(l, reduce ? 0 : t ? t.delay : l.j * 300);
    });
    const sl = M.sproutLeaf, wantS = !this.isDry && next <= 2;
    if (wantS && !sl.shown) this.showLeaf(sl, reduce ? 0 : last);
    else if (!wantS && sl.shown) this.hideLeaf(sl, 0);
    return last;
  }

  /* ---------- brote: tallo, luego ramitas, luego la hoja ---------- */
  private sprout(): void {
    const M = this.M!, z = this.reduce ? 0 : 1;
    const t = M.br[0];
    t.thT = t.th = 0.7;
    t.gT = SPROUT_G;
    this.tween(t, SPROUT_G, z ? 1900 : 1, z * 700);
    M.roots.forEach((r) => { if (r.group === "sprout") { r.gT = 1; this.tween(r, 1, z ? 1300 : 1, z * (150 + r.depth * 500)); } });
    M.br.filter((b) => b.twig).forEach((b, i) => { b.gT = 1; this.tween(b, 1, z ? 800 : 1, z * (1900 + i * 350)); });
    this.showLeaf(M.sproutLeaf, z * 2900);
  }

  /* ---------- secado ---------- */
  private fallLeaves(): void {
    const M = this.M!;
    [...M.leaves, M.sproutLeaf].forEach((l) => {
      if (!l.shown) return;
      l.shown = false;
      l.fallen = true;
      const delay = this.reduce ? 0 : Math.random() * 3800;
      const dur = this.reduce ? 10 : 2600 + Math.random() * 2000;
      const total = dur + (this.reduce ? 10 : 2400), k = dur / total;
      const dx = (Math.random() - 0.5) * 70, dy = -l.y + Math.random() * 4 - 1;
      const sw = 8 + Math.random() * 14, r = (Math.random() - 0.5) * 540;
      const tf = (x: number, y: number, a: number) => `translate(${F(x)}px,${F(y)}px) rotate(${F(a)}deg)`;
      l.anim = l.fall!.animate([
        { offset: 0, transform: tf(0, 0, 0), opacity: 1, easing: "ease-in" },
        { offset: k * 0.3, transform: tf(dx * 0.3 + sw, dy * 0.3, r * 0.3), opacity: 1, easing: "ease-in-out" },
        { offset: k * 0.65, transform: tf(dx * 0.65 - sw, dy * 0.66, r * 0.66), opacity: 1, easing: "ease-in-out" },
        { offset: k, transform: tf(dx, dy, r), opacity: 1 },
        { offset: k + (1 - k) * 0.45, transform: tf(dx, dy, r), opacity: 1 },
        { offset: 1, transform: tf(dx, dy, r), opacity: 0 },
      ], { duration: total, delay, fill: "forwards" });
    });
  }

  private undry(): void {
    const M = this.M!;
    this.isDry = false;
    this.els?.svg.classList.remove(TREE_CLASS.dry);
    [...M.leaves, M.sproutLeaf].forEach((l) => {
      if (l.anim) { l.anim.cancel(); l.anim = null; }
      if (l.fallen) {
        const g = l.grow!;
        g.style.transition = "none";
        g.style.transform = "scale(.001) rotate(-35deg)";
        g.style.opacity = "0";
        l.fallen = false;
      }
    });
    this.els?.svg.getBoundingClientRect();
  }

  /* ---------- cámara: siempre hacia delante, zoom proporcional a lo nuevo ---------- */
  private targetCam(): ViewBox {
    const M = this.M!;
    const bbox = (pts: [number, number][]) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      pts.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
      return { x0, y0, x1, y1 };
    };
    const square = (pts: [number, number][], minSize: number, pad: number): ViewBox => {
      const b = bbox(pts), size = Math.max(Math.max(b.x1 - b.x0, b.y1 - b.y0) * pad, minSize);
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      return { x: cx - size / 2, y: cy - size / 2, w: size, h: size };
    };

    if (this.isDry || this.camMode === "full") {
      const st = this.isDry ? TOTAL_STEPS : this.step;
      const pts: [number, number][] = [[-20, 0], [20, 0]];
      M.br.forEach((b) => { const g = gTarget(b, st); if (g > 0) b.pts.forEach((p, i) => { if (b.s[i] <= g * b.L + 1e-6) pts.push(p); }); });
      M.roots.forEach((r) => { if (gTarget(r, st) > 0) pts.push(...r.pts); });
      const b = bbox(pts), w = b.x1 - b.x0, h = b.y1 - b.y0, pad = Math.max(w, h) * 0.07 + 4;
      return { x: b.x0 - pad, y: b.y0 - pad, w: w + 2 * pad, h: h + 2 * pad };
    }
    if (this.step === 0) return { ...SPROUT_BOX };
    if (this.step === 1) return square([...M.br[0].pts, [0, 24]], 0, 1.2);
    const P = M.lineage[this.step - 2];
    const pts: [number, number][] = [P.pts[P.pts.length - 1]];
    const kids = P.kids.filter((k) => !k.twig);
    kids.forEach((k) => pts.push(...k.pts));
    const avg = kids.reduce((s, k) => s + k.L, 0) / kids.length;
    return square(pts, avg * 2.3, 1.18);
  }

  private setVB(c: ViewBox): void {
    this.els?.svg.setAttribute("viewBox", `${F(c.x)} ${F(c.y)} ${F(c.w)} ${F(c.h)}`);
  }

  private camera(forceDur?: number): void {
    const to = this.targetCam(), from = { ...this.cam };
    cancelAnimationFrame(this.camRaf);
    if (this.reduce) { this.cam = to; this.setVB(to); return; }
    const c0 = [from.x + from.w / 2, from.y + from.h / 2], c1 = [to.x + to.w / 2, to.y + to.h / 2];
    const lw = Math.log(to.w / from.w), lh = Math.log(to.h / from.h);
    const dist = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) / Math.max(from.w, to.w);
    const dur = forceDur ?? Math.min(3200, 1400 + Math.abs(lw) * 380 + dist * 500);
    const t0 = performance.now();
    const frame = (now: number) => {
      const k = Math.min(1, (now - t0) / dur), e = easeInOut(k);
      const w = from.w * Math.exp(lw * e), h = from.h * Math.exp(lh * e);
      // el centro avanza al ritmo del zoom: se siente como acercarse a un punto
      const u = Math.abs(lw) > 0.05 ? (w - from.w) / (to.w - from.w) : e;
      this.cam = { x: c0[0] + (c1[0] - c0[0]) * u - w / 2, y: c0[1] + (c1[1] - c0[1]) * u - h / 2, w, h };
      this.setVB(this.cam);
      if (k < 1) this.camRaf = requestAnimationFrame(frame);
    };
    this.camRaf = requestAnimationFrame(frame);
  }
}
