/**
 * Modelo geométrico del árbol: generación determinista por semilla y
 * construcción de las siluetas. No toca el DOM.
 */

export const TOTAL_STEPS = 15;   // una decisión = un paso = un nivel nuevo
export const FULL_DEPTH = 5;     // hasta este nivel crece el árbol completo; después solo cerca del foco
export const MAX_DEPTH = 14;     // nivel más profundo
export const MILESTONES = [0, 1, 2, 4, 7, 11, 15] as const;
export const STAGE_NAMES = [
  "Brote", "Tallo", "Primeras ramas", "Bifurcaciones",
  "Ramas secundarias", "Ramas terciarias", "Árbol desarrollado", "Árbol seco",
] as const;
export type StageName = (typeof STAGE_NAMES)[number];
export const DRY_STAGE_INDEX = 7;
export const SPROUT_G = 0.2;     // fracción del tronco visible en el brote
export const LEAF_D = "M0 -0.35L3 -0.3C6 -4.6 11 -5.1 16 0C11 4.8 6 4.4 3 0.3L0 0.35Z";

const PI = Math.PI;

export type Pt = [number, number];

export interface Spur { s: number; side: number; len: number; ang: number }

export interface Branch {
  id: number;
  depth: number;
  parent: Branch | null;
  kids: Branch[];
  pts: Pt[];
  s: number[];
  L: number;
  a0: number;
  endA: number;
  noise: number[];
  spurs: Spur[];
  /** hija que prolonga esta rama (se dibujan como una sola pieza) */
  cont: Branch | null;
  isCont: boolean;
  twig: boolean;
  fromTip: boolean;
  root: boolean;
  group: "sprout" | "tree" | null;
  k: number;
  /** crecimiento actual 0..1 y objetivo */
  g: number;
  gT: number;
  /** engrosamiento actual y objetivo */
  th: number;
  thT: number;
  /** ancho base calculado en cada frame */
  w: number;
  el: SVGPathElement | null;
  lastD: string;
}

export interface Leaf {
  b: Branch | null;
  t: number;
  x: number;
  y: number;
  rot: number;
  scale: number;
  lush: boolean;
  j: number;
  shown: boolean;
  sprout?: boolean;
  fallen?: boolean;
  fall?: SVGGElement;
  grow?: SVGGElement;
  anim?: Animation | null;
}

export interface TreeModel {
  br: Branch[];
  roots: Branch[];
  all: Branch[];
  lineage: Branch[];
  leaves: Leaf[];
  sproutLeaf: Leaf;
}

/* ---------- utilidades ---------- */
export function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const F = (n: number): string => n.toFixed(3);
export const norm = (a: number): number => {
  while (a > PI) a -= 2 * PI;
  while (a <= -PI) a += 2 * PI;
  return a;
};
const towardUp = (a: number, k: number) => a + norm(-PI / 2 - a) * k;
function clampDir(a: number): number {
  a = norm(a);
  if (a > 0.2 && a < PI - 0.2) a = a < PI / 2 ? 0.2 : PI - 0.2;
  return a;
}
export const easeInOut = (k: number): number => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

export function pointAt(b: Branch, sv: number): [number, number, number] {
  const s = b.s, p = b.pts;
  sv = Math.max(0, Math.min(b.L, sv));
  let i = 1;
  while (i < s.length - 1 && s[i] < sv) i++;
  const k = s[i] > s[i - 1] ? (sv - s[i - 1]) / (s[i] - s[i - 1]) : 0;
  return [
    p[i - 1][0] + (p[i][0] - p[i - 1][0]) * k,
    p[i - 1][1] + (p[i][1] - p[i - 1][1]) * k,
    Math.atan2(p[i][1] - p[i - 1][1], p[i][0] - p[i - 1][0]),
  ];
}

/* ---------- una rama: eje quebrado + grosor irregular + espinas ---------- */
interface BranchOpts {
  x: number; y: number; a: number; len: number; depth: number; kink: number;
  parent?: Branch | null; spurs?: boolean; fromTip?: boolean; root?: boolean;
  group?: "sprout" | "tree"; k?: number; n?: number; twig?: boolean;
}

function makeBranch(list: Branch[], R: () => number, o: BranchOpts): Branch {
  const N = o.n || 5 + (R() < 0.5 ? 1 : 0) + (o.len > 60 ? 1 : 0);
  const segs: number[] = [];
  let tot = 0;
  for (let i = 0; i < N; i++) { const v = 0.6 + R() * 0.8; segs.push(v); tot += v; }
  const target = o.a + (R() - 0.5) * 0.3;
  let a = o.a, x = o.x, y = o.y, acc = 0;
  const pts: Pt[] = [[x, y]], s = [0];
  for (let i = 0; i < N; i++) {
    a += (R() - 0.5) * o.kink;      // quiebre
    a += (target - a) * 0.35;       // sin perder el rumbo
    const sl = (o.len * segs[i]) / tot;
    x += Math.cos(a) * sl; y += Math.sin(a) * sl; acc += sl;
    pts.push([x, y]); s.push(acc);
  }
  const noise = pts.map((_, i) => (i === 0 || i === N ? 1 : 0.8 + R() * 0.4));
  const spurs: Spur[] = [];
  if (o.spurs) {
    const ns = R() < 0.5 ? 1 : R() < 0.3 ? 2 : 0;
    for (let k = 0; k < ns; k++) {
      spurs.push({ s: (0.2 + R() * 0.6) * acc, side: R() < 0.5 ? -1 : 1, len: (0.07 + R() * 0.08) * acc, ang: 0.55 + R() * 0.5 });
    }
  }
  const b: Branch = {
    id: list.length, depth: o.depth, parent: o.parent ?? null, kids: [], pts, s, L: acc, a0: o.a, endA: a,
    noise, spurs, cont: null, isCont: false, twig: !!o.twig, fromTip: o.fromTip !== false, root: !!o.root,
    group: o.group ?? null, k: o.k ?? 0.075, g: 0, gT: 0, th: 1, thT: 1, w: 0, el: null, lastD: "",
  };
  list.push(b);
  if (o.parent) o.parent.kids.push(b);
  return b;
}

/* ---------- modelo completo (determinista por semilla) ---------- */
export function buildModel(seed: number): TreeModel {
  const R = rng(seed);
  const br: Branch[] = [], lineage: Branch[] = [], onL = new Set<number>();

  const trunk = makeBranch(br, R, { x: 0, y: 0, a: -PI / 2 + (R() - 0.5) * 0.1, len: 118 + R() * 16, depth: 0, kink: 0.2, spurs: false, n: 14 });
  const RT = rng(seed + 13), sproutLen = SPROUT_G * trunk.L;
  ([[0.42, 1], [0.7, -1]] as const).forEach(([fr, sd]) => {   // dos ramitas del brote
    const p = pointAt(trunk, fr * sproutLen);
    makeBranch(br, RT, {
      x: p[0], y: p[1], a: p[2] + sd * (0.8 + RT() * 0.3), len: 5 + RT() * 2.5, depth: 1, parent: trunk,
      kink: 0.5, spurs: false, fromTip: false, k: 0.14, n: 4, twig: true,
    });
  });
  lineage.push(trunk);
  onL.add(trunk.id);

  const q: Branch[] = [trunk];
  while (q.length) {
    const b = q.shift()!;
    const may = b.depth < FULL_DEPTH ||
      (b.depth < MAX_DEPTH && (onL.has(b.id) || (b.parent !== null && onL.has(b.parent.id))));
    if (!may) continue;

    const specs: { tip: boolean; a: number; f: number }[] = [];
    if (R() < 0.4) {                                   // horqueta
      const sp = 0.3 + R() * 0.25;
      specs.push({ tip: true, a: b.endA - sp + (R() - 0.5) * 0.15, f: 0.72 + R() * 0.12 });
      specs.push({ tip: true, a: b.endA + sp + (R() - 0.5) * 0.15, f: 0.72 + R() * 0.12 });
      if (R() < 0.3) specs.push({ tip: false, a: 0, f: 0.55 + R() * 0.2 });
    } else {                                           // guía + laterales
      specs.push({ tip: true, a: b.endA + (R() - 0.5) * 0.4, f: 0.78 + R() * 0.1 });
      const nl = R() < 0.35 ? 2 : 1;
      for (let k = 0; k < nl; k++) specs.push({ tip: false, a: 0, f: 0.55 + R() * 0.2 });
    }

    let side = R() < 0.5 ? -1 : 1;
    const made = specs.map((sp) => {
      let x: number, y: number, a: number;
      if (sp.tip) {
        const tip = b.pts[b.pts.length - 1];
        x = tip[0]; y = tip[1]; a = sp.a;
      } else {
        const p = pointAt(b, (0.5 + R() * 0.4) * b.L);
        x = p[0]; y = p[1]; a = p[2] + side * (0.55 + R() * 0.45); side = -side;
      }
      a = clampDir(towardUp(a, 0.15));
      const c = makeBranch(br, R, { x, y, a, len: b.L * sp.f, depth: b.depth + 1, parent: b, kink: 0.45, spurs: true, fromTip: sp.tip });
      q.push(c);
      return c;
    });

    // la rama que prolonga a su madre se dibuja como una sola pieza con ella
    const tips = made.filter((c) => c.fromTip);
    if (tips.length) {
      const cont = tips.reduce((a, c) => (Math.abs(norm(c.a0 - b.endA)) < Math.abs(norm(a.a0 - b.endA)) ? c : a));
      b.cont = cont;
      cont.isCont = true;
    }
    // el foco sigue hacia delante, preferiblemente hacia arriba
    if (onL.has(b.id)) {
      let best = made[0], bs = -Infinity;
      made.forEach((c) => {
        const sc = -Math.abs(norm(c.endA + PI / 2)) + R() * 0.8 + (c.fromTip ? 0.2 : 0);
        if (sc > bs) { bs = sc; best = c; }
      });
      onL.add(best.id);
      lineage.push(best);
    }
  }

  // raíces
  const R2 = rng(seed + 7), roots: Branch[] = [];
  const tap = makeBranch(roots, R2, { x: 0, y: 0.3, a: PI / 2 + (R2() - 0.5) * 0.25, len: 19, depth: 0, kink: 0.55, root: true, group: "sprout", k: 0.09 });
  for (let k = 0; k < 3; k++) {
    const p = pointAt(tap, (0.25 + 0.22 * k + R2() * 0.08) * tap.L), sd = k % 2 ? 1 : -1;
    const r = makeBranch(roots, R2, { x: p[0], y: p[1], a: p[2] + sd * (0.8 + R2() * 0.5), len: 5 + R2() * 5, depth: 1, parent: tap, kink: 0.7, root: true, group: "sprout", fromTip: false, k: 0.09 });
    if (R2() < 0.75) {
      const p2 = pointAt(r, r.L * 0.6);
      makeBranch(roots, R2, { x: p2[0], y: p2[1], a: p2[2] - sd * (0.7 + R2() * 0.4), len: 2 + R2() * 2, depth: 2, parent: r, kink: 0.6, root: true, group: "sprout", fromTip: false, k: 0.09 });
    }
  }
  for (let k = 0; k < 4; k++) {
    const sd = k < 2 ? -1 : 1;
    const r = makeBranch(roots, R2, { x: sd * 1.6, y: 0.4, a: PI / 2 + sd * (0.4 + (k % 2) * 0.6 + R2() * 0.25), len: 30 + R2() * 24, depth: 0, kink: 0.5, root: true, group: "tree", k: 0.1 });
    for (let j = 0; j < 2; j++) {
      const p = pointAt(r, (0.35 + j * 0.3 + R2() * 0.1) * r.L), s2 = j ? 1 : -1;
      const c = makeBranch(roots, R2, { x: p[0], y: p[1], a: p[2] + s2 * (0.6 + R2() * 0.5), len: r.L * (0.35 + R2() * 0.2), depth: 1, parent: r, kink: 0.6, root: true, group: "tree", fromTip: false, k: 0.1 });
      const p2 = pointAt(c, c.L * 0.55);
      makeBranch(roots, R2, { x: p2[0], y: p2[1], a: p2[2] - s2 * 0.7, len: c.L * 0.4, depth: 2, parent: c, kink: 0.6, root: true, group: "tree", fromTip: false, k: 0.1 });
    }
  }

  // hojas: pocas, sobre todo en puntas
  const leaves: Leaf[] = [];
  br.forEach((b) => {
    if (b.depth < 3) return;
    const terminal = b.kids.length === 0;
    const n = terminal ? (R() < 0.7 ? 1 : 2) : R() < 0.15 ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const t = terminal ? (i === 0 ? 0.92 + R() * 0.08 : 0.55 + R() * 0.3) : 0.4 + R() * 0.4;
      const p = pointAt(b, t * b.L);
      const rot = p[2] + (terminal && i === 0 ? (R() - 0.5) * 0.5 : (R() < 0.5 ? -1 : 1) * (0.6 + R() * 0.5));
      leaves.push({ b, t, x: p[0], y: p[1], rot, scale: ((terminal ? 0.42 : 0.3) * b.L * (0.85 + R() * 0.3)) / 16, lush: false, j: R(), shown: false });
    }
    if (!terminal && R() < 0.25) {
      const p = pointAt(b, (0.45 + R() * 0.4) * b.L);
      leaves.push({ b, t: 0.6, x: p[0], y: p[1], rot: p[2] + (R() < 0.5 ? -1 : 1) * (0.7 + R() * 0.4), scale: (0.3 * b.L) / 16, lush: true, j: R(), shown: false });
    }
  });
  const sp = pointAt(trunk, sproutLen * 0.84);
  const sproutLeaf: Leaf = { b: null, t: 0, sprout: true, x: sp[0], y: sp[1], rot: sp[2] + 0.95, scale: 13 / 16, lush: false, j: 0, shown: false };

  return { br, roots, all: br.concat(roots), lineage, leaves, sproutLeaf };
}

/** crecimiento objetivo de una rama en un paso dado */
export function gTarget(b: Branch, step: number): number {
  if (b.twig) return 1;
  if (b.root) return b.group === "sprout" ? 1 : step >= 1 ? 1 : 0;
  if (b.depth === 0) return step === 0 ? SPROUT_G : 1;
  return b.depth < step ? 1 : 0;
}

/* ---------- geometría de la silueta ----------
   Una rama y su prolongación forman un solo contorno. La punta afilada vive en el
   frente de crecimiento: cuando la rama sigue creciendo, la punta anterior se
   ensancha poco a poco en lugar de quedar como un pico separado. */
export function branchWidth(b: Branch): number {
  return b.k * b.L * b.th * (0.15 + 0.85 * b.g);
}
const taper = (x: number) => (x >= 1 ? 1 : x <= 0 ? 0 : 1 - Math.pow(1 - x, 1.5));

export function limbD(b0: Branch): string {
  if (b0.g <= 0.002) return "";
  const P: Pt[] = [], U: number[] = [], WS: number[] = [], NZ: number[] = [];
  const segs: { b: Branch; u0: number; gl: number; we: number }[] = [];
  let b: Branch | null = b0, u0 = 0, front = 0, first = true;
  while (b && b.g > 0.002) {
    const gl = b.g * b.L, we = b.cont ? b.cont.w : b.w * 0.45;
    for (let i = 0; i < b.pts.length; i++) {
      if (!first && i === 0) continue;
      if (b.s[i] >= gl - 1e-9) break;
      P.push(b.pts[i]); U.push(u0 + b.s[i]); WS.push(b.w + (we - b.w) * (b.s[i] / b.L)); NZ.push(b.noise[i]);
    }
    const e = pointAt(b, gl);
    P.push([e[0], e[1]]); U.push(u0 + gl); WS.push(b.w + (we - b.w) * (gl / b.L)); NZ.push(1);
    segs.push({ b, u0, gl, we });
    if (b.g < 0.999) { front = u0 + gl; break; }
    u0 += b.L; front = u0; b = b.cont; first = false;
  }
  const n = P.length;
  if (n < 2) return "";
  const Z = Math.max(1e-6, Math.min(5 * WS[n - 1], 0.85 * front));
  const flareLen = 0.12 * b0.L, fl = b0.depth === 0 ? (b0.root ? 0.3 : 0.5) : 0.25;
  const Lf: Pt[] = [], Rt: Pt[] = [];
  for (let i = 0; i < n; i++) {
    let w = WS[i] * NZ[i] * taper((front - U[i]) / Z);
    if (U[i] < flareLen) w *= 1 + fl * (1 - U[i] / flareLen);
    const a = P[Math.max(0, i - 1)], c = P[Math.min(n - 1, i + 1)];
    let dx = c[0] - a[0], dy = c[1] - a[1];
    const m = Math.hypot(dx, dy) || 1;
    dx /= m; dy /= m;
    const h = w / 2;
    Lf.push([P[i][0] - dy * h, P[i][1] + dx * h]);
    Rt.push([P[i][0] + dy * h, P[i][1] - dx * h]);
  }
  const poly = Lf.concat(Rt.slice().reverse());
  let area = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; area += p[0] * q[1] - q[0] * p[1]; }
  let d = "M" + poly.map((p) => F(p[0]) + " " + F(p[1])).join("L") + "Z";

  for (const sg of segs) {                                  // espinas / muñones
    for (const sp of sg.b.spurs) {
      if (sp.s > sg.gl * 0.92) continue;
      const u = sg.u0 + sp.s;
      const w = (sg.b.w + (sg.we - sg.b.w) * (sp.s / sg.b.L)) * taper((front - u) / Z);
      if (w <= 0.001) continue;
      const gr = Math.min(1, (front - u) / (sp.len * 2));
      const [px, py, la] = pointAt(sg.b, sp.s);
      const dx = Math.cos(la), dy = Math.sin(la), ta = la + sp.side * sp.ang, tl = w * 0.5 + sp.len * gr;
      const tri: Pt[] = [[px - dx * w * 0.6, py - dy * w * 0.6], [px + Math.cos(ta) * tl, py + Math.sin(ta) * tl], [px + dx * w * 0.6, py + dy * w * 0.6]];
      let ta2 = 0;
      for (let i = 0; i < 3; i++) { const p = tri[i], q = tri[(i + 1) % 3]; ta2 += p[0] * q[1] - q[0] * p[1]; }
      if (Math.sign(ta2) !== Math.sign(area)) tri.reverse();   // misma orientación: sin huecos
      d += "M" + tri.map((p) => F(p[0]) + " " + F(p[1])).join("L") + "Z";
    }
  }
  return d;
}
