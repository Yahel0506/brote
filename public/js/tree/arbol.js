/* Generado por tools/build-tree.mjs desde arbol/. No editar. */
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// arbol/model.ts
var TOTAL_STEPS = 15;
var FULL_DEPTH = 5;
var MAX_DEPTH = 14;
var MILESTONES = [0, 1, 2, 4, 7, 11, 15];
var STAGE_NAMES = [
  "Brote",
  "Tallo",
  "Primeras ramas",
  "Bifurcaciones",
  "Ramas secundarias",
  "Ramas terciarias",
  "\xC1rbol desarrollado",
  "\xC1rbol seco"
];
var DRY_STAGE_INDEX = 7;
var SPROUT_G = 0.2;
var LEAF_D = "M0 -0.35L3 -0.3C6 -4.6 11 -5.1 16 0C11 4.8 6 4.4 3 0.3L0 0.35Z";
var PI = Math.PI;
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var F = (n) => n.toFixed(3);
var norm = (a) => {
  while (a > PI) a -= 2 * PI;
  while (a <= -PI) a += 2 * PI;
  return a;
};
var towardUp = (a, k) => a + norm(-PI / 2 - a) * k;
function clampDir(a) {
  a = norm(a);
  if (a > 0.2 && a < PI - 0.2) a = a < PI / 2 ? 0.2 : PI - 0.2;
  return a;
}
var easeInOut = (k) => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
function pointAt(b, sv) {
  const s = b.s, p = b.pts;
  sv = Math.max(0, Math.min(b.L, sv));
  let i = 1;
  while (i < s.length - 1 && s[i] < sv) i++;
  const k = s[i] > s[i - 1] ? (sv - s[i - 1]) / (s[i] - s[i - 1]) : 0;
  return [
    p[i - 1][0] + (p[i][0] - p[i - 1][0]) * k,
    p[i - 1][1] + (p[i][1] - p[i - 1][1]) * k,
    Math.atan2(p[i][1] - p[i - 1][1], p[i][0] - p[i - 1][0])
  ];
}
function makeBranch(list, R, o) {
  const N = o.n || 5 + (R() < 0.5 ? 1 : 0) + (o.len > 60 ? 1 : 0);
  const segs = [];
  let tot = 0;
  for (let i = 0; i < N; i++) {
    const v = 0.6 + R() * 0.8;
    segs.push(v);
    tot += v;
  }
  const target = o.a + (R() - 0.5) * 0.3;
  let a = o.a, x = o.x, y = o.y, acc = 0;
  const pts = [[x, y]], s = [0];
  for (let i = 0; i < N; i++) {
    a += (R() - 0.5) * o.kink;
    a += (target - a) * 0.35;
    const sl = o.len * segs[i] / tot;
    x += Math.cos(a) * sl;
    y += Math.sin(a) * sl;
    acc += sl;
    pts.push([x, y]);
    s.push(acc);
  }
  const noise = pts.map((_, i) => i === 0 || i === N ? 1 : 0.8 + R() * 0.4);
  const spurs = [];
  if (o.spurs) {
    const ns = R() < 0.5 ? 1 : R() < 0.3 ? 2 : 0;
    for (let k = 0; k < ns; k++) {
      spurs.push({ s: (0.2 + R() * 0.6) * acc, side: R() < 0.5 ? -1 : 1, len: (0.07 + R() * 0.08) * acc, ang: 0.55 + R() * 0.5 });
    }
  }
  const b = {
    id: list.length,
    depth: o.depth,
    parent: o.parent ?? null,
    kids: [],
    pts,
    s,
    L: acc,
    a0: o.a,
    endA: a,
    noise,
    spurs,
    cont: null,
    isCont: false,
    twig: !!o.twig,
    fromTip: o.fromTip !== false,
    root: !!o.root,
    group: o.group ?? null,
    k: o.k ?? 0.075,
    g: 0,
    gT: 0,
    th: 1,
    thT: 1,
    w: 0,
    el: null,
    lastD: ""
  };
  list.push(b);
  if (o.parent) o.parent.kids.push(b);
  return b;
}
function buildModel(seed) {
  const R = rng(seed);
  const br = [], lineage = [], onL = /* @__PURE__ */ new Set();
  const trunk = makeBranch(br, R, { x: 0, y: 0, a: -PI / 2 + (R() - 0.5) * 0.1, len: 118 + R() * 16, depth: 0, kink: 0.2, spurs: false, n: 14 });
  const RT = rng(seed + 13), sproutLen = SPROUT_G * trunk.L;
  [[0.42, 1], [0.7, -1]].forEach(([fr, sd]) => {
    const p = pointAt(trunk, fr * sproutLen);
    makeBranch(br, RT, {
      x: p[0],
      y: p[1],
      a: p[2] + sd * (0.8 + RT() * 0.3),
      len: 5 + RT() * 2.5,
      depth: 1,
      parent: trunk,
      kink: 0.5,
      spurs: false,
      fromTip: false,
      k: 0.14,
      n: 4,
      twig: true
    });
  });
  lineage.push(trunk);
  onL.add(trunk.id);
  const q = [trunk];
  while (q.length) {
    const b = q.shift();
    const may = b.depth < FULL_DEPTH || b.depth < MAX_DEPTH && (onL.has(b.id) || b.parent !== null && onL.has(b.parent.id));
    if (!may) continue;
    const specs = [];
    if (R() < 0.4) {
      const sp2 = 0.3 + R() * 0.25;
      specs.push({ tip: true, a: b.endA - sp2 + (R() - 0.5) * 0.15, f: 0.72 + R() * 0.12 });
      specs.push({ tip: true, a: b.endA + sp2 + (R() - 0.5) * 0.15, f: 0.72 + R() * 0.12 });
      if (R() < 0.3) specs.push({ tip: false, a: 0, f: 0.55 + R() * 0.2 });
    } else {
      specs.push({ tip: true, a: b.endA + (R() - 0.5) * 0.4, f: 0.78 + R() * 0.1 });
      const nl = R() < 0.35 ? 2 : 1;
      for (let k = 0; k < nl; k++) specs.push({ tip: false, a: 0, f: 0.55 + R() * 0.2 });
    }
    let side = R() < 0.5 ? -1 : 1;
    const made = specs.map((sp2) => {
      let x, y, a;
      if (sp2.tip) {
        const tip = b.pts[b.pts.length - 1];
        x = tip[0];
        y = tip[1];
        a = sp2.a;
      } else {
        const p = pointAt(b, (0.5 + R() * 0.4) * b.L);
        x = p[0];
        y = p[1];
        a = p[2] + side * (0.55 + R() * 0.45);
        side = -side;
      }
      a = clampDir(towardUp(a, 0.15));
      const c = makeBranch(br, R, { x, y, a, len: b.L * sp2.f, depth: b.depth + 1, parent: b, kink: 0.45, spurs: true, fromTip: sp2.tip });
      q.push(c);
      return c;
    });
    const tips = made.filter((c) => c.fromTip);
    if (tips.length) {
      const cont = tips.reduce((a, c) => Math.abs(norm(c.a0 - b.endA)) < Math.abs(norm(a.a0 - b.endA)) ? c : a);
      b.cont = cont;
      cont.isCont = true;
    }
    if (onL.has(b.id)) {
      let best = made[0], bs = -Infinity;
      made.forEach((c) => {
        const sc = -Math.abs(norm(c.endA + PI / 2)) + R() * 0.8 + (c.fromTip ? 0.2 : 0);
        if (sc > bs) {
          bs = sc;
          best = c;
        }
      });
      onL.add(best.id);
      lineage.push(best);
    }
  }
  const R2 = rng(seed + 7), roots = [];
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
    const r = makeBranch(roots, R2, { x: sd * 1.6, y: 0.4, a: PI / 2 + sd * (0.4 + k % 2 * 0.6 + R2() * 0.25), len: 30 + R2() * 24, depth: 0, kink: 0.5, root: true, group: "tree", k: 0.1 });
    for (let j = 0; j < 2; j++) {
      const p = pointAt(r, (0.35 + j * 0.3 + R2() * 0.1) * r.L), s2 = j ? 1 : -1;
      const c = makeBranch(roots, R2, { x: p[0], y: p[1], a: p[2] + s2 * (0.6 + R2() * 0.5), len: r.L * (0.35 + R2() * 0.2), depth: 1, parent: r, kink: 0.6, root: true, group: "tree", fromTip: false, k: 0.1 });
      const p2 = pointAt(c, c.L * 0.55);
      makeBranch(roots, R2, { x: p2[0], y: p2[1], a: p2[2] - s2 * 0.7, len: c.L * 0.4, depth: 2, parent: c, kink: 0.6, root: true, group: "tree", fromTip: false, k: 0.1 });
    }
  }
  const leaves = [];
  br.forEach((b) => {
    if (b.depth < 3) return;
    const terminal = b.kids.length === 0;
    const n = terminal ? R() < 0.7 ? 1 : 2 : R() < 0.15 ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const t = terminal ? i === 0 ? 0.92 + R() * 0.08 : 0.55 + R() * 0.3 : 0.4 + R() * 0.4;
      const p = pointAt(b, t * b.L);
      const rot = p[2] + (terminal && i === 0 ? (R() - 0.5) * 0.5 : (R() < 0.5 ? -1 : 1) * (0.6 + R() * 0.5));
      leaves.push({ b, t, x: p[0], y: p[1], rot, scale: (terminal ? 0.42 : 0.3) * b.L * (0.85 + R() * 0.3) / 16, lush: false, j: R(), shown: false });
    }
    if (!terminal && R() < 0.25) {
      const p = pointAt(b, (0.45 + R() * 0.4) * b.L);
      leaves.push({ b, t: 0.6, x: p[0], y: p[1], rot: p[2] + (R() < 0.5 ? -1 : 1) * (0.7 + R() * 0.4), scale: 0.3 * b.L / 16, lush: true, j: R(), shown: false });
    }
  });
  const sp = pointAt(trunk, sproutLen * 0.84);
  const sproutLeaf = { b: null, t: 0, sprout: true, x: sp[0], y: sp[1], rot: sp[2] + 0.95, scale: 13 / 16, lush: false, j: 0, shown: false };
  return { br, roots, all: br.concat(roots), lineage, leaves, sproutLeaf };
}
function gTarget(b, step) {
  if (b.twig) return 1;
  if (b.root) return b.group === "sprout" ? 1 : step >= 1 ? 1 : 0;
  if (b.depth === 0) return step === 0 ? SPROUT_G : 1;
  return b.depth < step ? 1 : 0;
}
function branchWidth(b) {
  return b.k * b.L * b.th * (0.15 + 0.85 * b.g);
}
var taper = (x) => x >= 1 ? 1 : x <= 0 ? 0 : 1 - Math.pow(1 - x, 1.5);
function limbD(b0) {
  if (b0.g <= 2e-3) return "";
  const P = [], U = [], WS = [], NZ = [];
  const segs = [];
  let b = b0, u0 = 0, front = 0, first = true;
  while (b && b.g > 2e-3) {
    const gl = b.g * b.L, we = b.cont ? b.cont.w : b.w * 0.45;
    for (let i = 0; i < b.pts.length; i++) {
      if (!first && i === 0) continue;
      if (b.s[i] >= gl - 1e-9) break;
      P.push(b.pts[i]);
      U.push(u0 + b.s[i]);
      WS.push(b.w + (we - b.w) * (b.s[i] / b.L));
      NZ.push(b.noise[i]);
    }
    const e = pointAt(b, gl);
    P.push([e[0], e[1]]);
    U.push(u0 + gl);
    WS.push(b.w + (we - b.w) * (gl / b.L));
    NZ.push(1);
    segs.push({ b, u0, gl, we });
    if (b.g < 0.999) {
      front = u0 + gl;
      break;
    }
    u0 += b.L;
    front = u0;
    b = b.cont;
    first = false;
  }
  const n = P.length;
  if (n < 2) return "";
  const Z = Math.max(1e-6, Math.min(5 * WS[n - 1], 0.85 * front));
  const flareLen = 0.12 * b0.L, fl = b0.depth === 0 ? b0.root ? 0.3 : 0.5 : 0.25;
  const Lf = [], Rt = [];
  for (let i = 0; i < n; i++) {
    let w = WS[i] * NZ[i] * taper((front - U[i]) / Z);
    if (U[i] < flareLen) w *= 1 + fl * (1 - U[i] / flareLen);
    const a = P[Math.max(0, i - 1)], c = P[Math.min(n - 1, i + 1)];
    let dx = c[0] - a[0], dy = c[1] - a[1];
    const m = Math.hypot(dx, dy) || 1;
    dx /= m;
    dy /= m;
    const h = w / 2;
    Lf.push([P[i][0] - dy * h, P[i][1] + dx * h]);
    Rt.push([P[i][0] + dy * h, P[i][1] - dx * h]);
  }
  const poly = Lf.concat(Rt.slice().reverse());
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    area += p[0] * q[1] - q[0] * p[1];
  }
  let d = "M" + poly.map((p) => F(p[0]) + " " + F(p[1])).join("L") + "Z";
  for (const sg of segs) {
    for (const sp of sg.b.spurs) {
      if (sp.s > sg.gl * 0.92) continue;
      const u = sg.u0 + sp.s;
      const w = (sg.b.w + (sg.we - sg.b.w) * (sp.s / sg.b.L)) * taper((front - u) / Z);
      if (w <= 1e-3) continue;
      const gr = Math.min(1, (front - u) / (sp.len * 2));
      const [px, py, la] = pointAt(sg.b, sp.s);
      const dx = Math.cos(la), dy = Math.sin(la), ta = la + sp.side * sp.ang, tl = w * 0.5 + sp.len * gr;
      const tri = [[px - dx * w * 0.6, py - dy * w * 0.6], [px + Math.cos(ta) * tl, py + Math.sin(ta) * tl], [px + dx * w * 0.6, py + dy * w * 0.6]];
      let ta2 = 0;
      for (let i = 0; i < 3; i++) {
        const p = tri[i], q = tri[(i + 1) % 3];
        ta2 += p[0] * q[1] - q[0] * p[1];
      }
      if (Math.sign(ta2) !== Math.sign(area)) tri.reverse();
      d += "M" + tri.map((p) => F(p[0]) + " " + F(p[1])).join("L") + "Z";
    }
  }
  return d;
}

// arbol/TreeController.ts
var NS = "http://www.w3.org/2000/svg";
var PI2 = Math.PI;
var SPROUT_BOX = { x: -40, y: -44, w: 80, h: 80 };
var LAYOUT_TRANSFORM = {
  center: "translateX(0%)",
  right: "translateX(22%)",
  left: "translateX(-22%)"
};
var TREE_CLASS = {
  sil: "arbol-sil",
  gline: "arbol-gline",
  soil: "arbol-soil",
  fall: "arbol-fall",
  grow: "arbol-grow",
  leaf: "arbol-lf",
  dry: "arbol-dry"
};
function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
var TreeController = class {
  constructor(opts = {}) {
    __publicField(this, "seed");
    __publicField(this, "step", 0);
    __publicField(this, "isDry", false);
    __publicField(this, "camMode");
    __publicField(this, "layout");
    __publicField(this, "reduceOpt");
    __publicField(this, "reduce", false);
    __publicField(this, "M", null);
    __publicField(this, "els", null);
    __publicField(this, "cam", { ...SPROUT_BOX });
    __publicField(this, "camRaf", 0);
    __publicField(this, "rafId", 0);
    __publicField(this, "running", false);
    __publicField(this, "lastT", 0);
    __publicField(this, "tweens", []);
    __publicField(this, "timers", []);
    __publicField(this, "listeners", /* @__PURE__ */ new Set());
    __publicField(this, "snapshot");
    /* =========================================================
       API pública: estado
       ========================================================= */
    /** Suscripción a cambios (compatible con useSyncExternalStore) */
    __publicField(this, "subscribe", (fn) => {
      this.listeners.add(fn);
      return () => {
        this.listeners.delete(fn);
      };
    });
    /** Instantánea inmutable del estado actual */
    __publicField(this, "getState", () => this.snapshot);
    /* =========================================================
       API pública: acciones
       ========================================================= */
    /** Crece una decisión (un nivel nuevo de ramas) */
    __publicField(this, "grow", () => this.goStep(this.isDry ? this.step : this.step + 1));
    /** Deshace el último paso (las ramas se retraen) */
    __publicField(this, "back", () => this.goStep(this.step - 1));
    /** Va a un paso concreto, 0..15 */
    __publicField(this, "goStep", (n) => {
      n = Math.max(0, Math.min(TOTAL_STEPS, Math.round(n)));
      if (!this.M) {
        this.step = n;
        this.isDry = false;
        this.emit();
        return;
      }
      this.clearTimers();
      const wasDry = this.isDry;
      if (wasDry) this.undry();
      if (n === this.step && !wasDry) return;
      const prev = this.step;
      this.step = n;
      this.apply(prev, n);
      this.camera();
      this.emit();
    });
    /** Va a un estado: 0 Brote … 6 Árbol desarrollado, 7 Árbol seco */
    __publicField(this, "goState", (i) => {
      if (i >= DRY_STAGE_INDEX) this.dry();
      else this.goStep(MILESTONES[Math.max(0, i)]);
    });
    /** Final: crece lo que falte, las hojas caen y la madera se apaga */
    __publicField(this, "dry", () => {
      if (this.isDry) return;
      if (!this.M) {
        this.step = TOTAL_STEPS;
        this.isDry = true;
        this.emit();
        return;
      }
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
    });
    /** Vuelve al brote: las ramas se retraen de la punta hacia el tronco */
    __publicField(this, "reset", () => {
      if (!this.M) {
        this.step = 0;
        this.isDry = false;
        this.emit();
        return;
      }
      this.clearTimers();
      if (this.isDry) this.undry();
      const prev = this.step;
      this.step = 0;
      this.apply(prev, 0);
      this.camera();
      this.emit();
    });
    /** Genera otro árbol; si no se pasa semilla, se elige una al azar */
    __publicField(this, "setSeed", (seed) => {
      this.seed = seed ?? 1 + Math.floor(Math.random() * 9999);
      if (!this.els) {
        this.emit();
        return;
      }
      this.rebuild(this.step, false);
    });
    /** "follow": la cámara sigue el crecimiento; "full": muestra todo el árbol */
    __publicField(this, "setCameraMode", (mode) => {
      this.camMode = mode;
      if (this.M) this.camera();
      this.emit();
    });
    /** Posición del árbol dentro de su contenedor */
    __publicField(this, "setLayout", (layout) => {
      this.layout = layout;
      this.applyLayout();
      this.emit();
    });
    __publicField(this, "loop", (now) => {
      if (!this.M) {
        this.running = false;
        return;
      }
      const dt = Math.min(0.05, (now - this.lastT) / 1e3);
      this.lastT = now;
      let active = false, dirty = false;
      for (let i = this.tweens.length - 1; i >= 0; i--) {
        const t = this.tweens[i];
        if (now < t.t0) {
          active = true;
          continue;
        }
        if (t.from === null) t.from = t.obj.g;
        const k = Math.min(1, (now - t.t0) / t.dur);
        t.obj.g = t.from + (t.to - t.from) * easeInOut(k);
        dirty = true;
        if (k >= 1) this.tweens.splice(i, 1);
        else active = true;
      }
      for (const b of this.M.all) {
        const d = b.thT - b.th;
        if (Math.abs(d) > 5e-4) {
          b.th += d * Math.min(1, dt * (this.reduce ? 60 : 1.8));
          dirty = active = true;
        } else if (d !== 0) {
          b.th = b.thT;
          dirty = true;
        }
      }
      if (dirty) this.redraw();
      if (active) this.rafId = requestAnimationFrame(this.loop);
      else this.running = false;
    });
    this.seed = opts.seed ?? 7;
    this.camMode = opts.cameraMode ?? "follow";
    this.layout = opts.layout ?? "center";
    this.reduceOpt = opts.reducedMotion;
    this.snapshot = this.makeSnapshot();
  }
  /* =========================================================
     Conexión con el DOM (la usa el componente)
     ========================================================= */
  attach(els) {
    if (this.els) this.detach();
    this.els = els;
    this.reduce = this.reduceOpt ?? (typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    this.mountGround();
    this.applyLayout();
    this.rebuild(this.step, this.isDry);
  }
  detach() {
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
  emit() {
    this.snapshot = this.makeSnapshot();
    this.listeners.forEach((fn) => fn());
  }
  makeSnapshot() {
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
      canGoBack: this.step > 0
    };
  }
  stageIndex() {
    if (this.isDry) return DRY_STAGE_INDEX;
    let i = 0;
    MILESTONES.forEach((m, k) => {
      if (m <= this.step) i = k;
    });
    return i;
  }
  later(fn, ms) {
    this.timers.push(setTimeout(fn, ms));
  }
  clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
  rebuild(target, wantDry) {
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
        if (target > 0) {
          this.step = target;
          this.apply(0, target);
          this.camera();
          this.emit();
        }
        if (wantDry) this.dry();
      }, this.reduce ? 0 : 2600);
    }
  }
  applyLayout() {
    if (this.els) this.els.wrap.style.transform = LAYOUT_TRANSFORM[this.layout];
  }
  /* ---------- DOM ---------- */
  mountGround() {
    const { ground, soil } = this.els;
    ground.replaceChildren();
    soil.replaceChildren();
    let a = 3;
    const R = () => {
      a |= 0;
      a = a + 1831565813 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    let d = "M-3000 0";
    for (let x = -600; x <= 600; x += Math.abs(x) < 70 ? 5 : 30) d += `L${x} ${F((R() - 0.5) * (Math.abs(x) < 70 ? 0.7 : 1.4))}`;
    d += "L3000 0";
    el("path", { d, class: TREE_CLASS.gline }, ground);
    for (let i = 0; i < 11; i++) {
      const x = (R() < 0.5 ? -1 : 1) * (5 + R() * 34), y = 0.5 + R() * 2.2, r = 0.35 + R() * 0.7;
      const pts = [0, 1, 2, 3, 4].map((k) => {
        const an = k / 5 * 2 * PI2 + R() * 0.6, rr = r * (0.6 + R() * 0.6);
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
  mount() {
    const { branches, roots, leaves, svg } = this.els;
    const M = this.M;
    branches.replaceChildren();
    roots.replaceChildren();
    leaves.replaceChildren();
    svg.classList.remove(TREE_CLASS.dry);
    M.br.forEach((b) => {
      b.el = el("path", { d: "", class: TREE_CLASS.sil }, branches);
    });
    M.roots.forEach((b) => {
      b.el = el("path", { d: "", class: TREE_CLASS.sil }, roots);
    });
    [...M.leaves, M.sproutLeaf].forEach((l) => {
      const fall = el("g", { class: TREE_CLASS.fall }, leaves);
      const pos = el("g", { transform: `translate(${F(l.x)} ${F(l.y)}) rotate(${F(l.rot * 180 / PI2)}) scale(${F(l.scale)})` }, fall);
      const grow = el("g", { class: TREE_CLASS.grow }, pos);
      el("path", { d: LEAF_D, class: TREE_CLASS.leaf }, grow);
      l.fall = fall;
      l.grow = grow;
    });
  }
  /* ---------- motor de animación (rAF) ---------- */
  tween(obj, to, dur, delay) {
    for (let i = this.tweens.length - 1; i >= 0; i--) if (this.tweens[i].obj === obj) this.tweens.splice(i, 1);
    this.tweens.push({ obj, to, dur: Math.max(1, dur), t0: performance.now() + delay, from: null });
    this.kick();
  }
  kick() {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }
  redraw() {
    const M = this.M;
    for (const b of M.all) b.w = branchWidth(b);
    for (const b of M.all) {
      const d = b.isCont ? "" : limbD(b);
      if (d !== b.lastD) {
        b.el.setAttribute("d", d);
        b.lastD = d;
      }
    }
  }
  /* ---------- hojas ---------- */
  showLeaf(l, delay) {
    const g = l.grow;
    getComputedStyle(g).transform;
    g.style.transition = `transform ${this.reduce ? 1 : 1300}ms cubic-bezier(.3,0,.2,1) ${delay}ms, opacity ${this.reduce ? 1 : 350}ms ease ${delay}ms`;
    g.style.transform = "scale(1) rotate(0deg)";
    g.style.opacity = "1";
    l.shown = true;
  }
  hideLeaf(l, delay) {
    const g = l.grow;
    g.style.transition = `transform 450ms ease ${delay}ms, opacity 450ms ease ${delay}ms`;
    g.style.transform = "scale(.001) rotate(-35deg)";
    g.style.opacity = "0";
    l.shown = false;
  }
  /* ---------- transición entre pasos; devuelve su duración (ms) ---------- */
  apply(prev, next) {
    const M = this.M, reduce = this.reduce;
    const levels = Math.abs(next - prev);
    const gs = Math.max(0.45, Math.min(1, 9e3 / (1800 + 1250 * levels)));
    const RET = Math.max(250, Math.min(650, 4500 / Math.max(1, levels)));
    const start = {};
    let acc = 0;
    for (let d = prev; d < next; d++) {
      start[d] = acc;
      acc += (d === 0 ? 1800 : 1250) * gs;
    }
    const timing = /* @__PURE__ */ new Map();
    let last = 0;
    for (const b of M.all) {
      const tgt = gTarget(b, next);
      if (tgt === b.gT) continue;
      let delay, dur;
      if (tgt > b.gT) {
        if (b.root) {
          delay = 200 + b.depth * 450;
          dur = 1500;
        } else {
          delay = (start[b.depth] || 0) + (b.fromTip ? 0 : 220);
          dur = (b.depth === 0 ? 1800 : 1250) * gs;
        }
      } else {
        delay = b.root ? Math.max(0, prev - 1) * RET + (2 - b.depth) * 150 : Math.max(0, prev - 1 - b.depth) * RET;
        dur = RET;
      }
      if (reduce) {
        delay = 0;
        dur = 1;
      }
      b.gT = tgt;
      this.tween(b, tgt, dur, delay);
      timing.set(b, { delay, dur, grow: tgt > 0.5 });
      last = Math.max(last, delay + dur);
    }
    const cnt = /* @__PURE__ */ new Map();
    for (let i = M.br.length - 1; i >= 0; i--) {
      const b = M.br[i];
      let c = 0;
      if (gTarget(b, next) > 0) {
        for (const k of b.kids) if (gTarget(k, next) > 0) c += 1 + (cnt.get(k) || 0);
      }
      cnt.set(b, c);
      b.thT = 1 + 0.17 * Math.log2(1 + c);
    }
    if (next === 0) M.br[0].thT = 0.7;
    M.roots.forEach((r) => {
      r.thT = r.group === "tree" ? 1 + 0.9 * Math.min(1, next / 10) : 1;
    });
    this.kick();
    M.leaves.forEach((l) => {
      const want = !this.isDry && gTarget(l.b, next) > 0 && (!l.lush || next === TOTAL_STEPS);
      const t = timing.get(l.b);
      if (want && !l.shown) this.showLeaf(l, reduce ? 0 : t && t.grow ? t.delay + t.dur * l.t * 0.9 + 200 + l.j * 500 : 300 + l.j * 1200);
      else if (!want && l.shown) this.hideLeaf(l, reduce ? 0 : t ? t.delay : l.j * 300);
    });
    const sl = M.sproutLeaf, wantS = !this.isDry && next <= 2;
    if (wantS && !sl.shown) this.showLeaf(sl, reduce ? 0 : last);
    else if (!wantS && sl.shown) this.hideLeaf(sl, 0);
    return last;
  }
  /* ---------- brote: tallo, luego ramitas, luego la hoja ---------- */
  sprout() {
    const M = this.M, z = this.reduce ? 0 : 1;
    const t = M.br[0];
    t.thT = t.th = 0.7;
    t.gT = SPROUT_G;
    this.tween(t, SPROUT_G, z ? 1900 : 1, z * 700);
    M.roots.forEach((r) => {
      if (r.group === "sprout") {
        r.gT = 1;
        this.tween(r, 1, z ? 1300 : 1, z * (150 + r.depth * 500));
      }
    });
    M.br.filter((b) => b.twig).forEach((b, i) => {
      b.gT = 1;
      this.tween(b, 1, z ? 800 : 1, z * (1900 + i * 350));
    });
    this.showLeaf(M.sproutLeaf, z * 2900);
  }
  /* ---------- secado ---------- */
  fallLeaves() {
    const M = this.M;
    [...M.leaves, M.sproutLeaf].forEach((l) => {
      if (!l.shown) return;
      l.shown = false;
      l.fallen = true;
      const delay = this.reduce ? 0 : Math.random() * 3800;
      const dur = this.reduce ? 10 : 2600 + Math.random() * 2e3;
      const total = dur + (this.reduce ? 10 : 2400), k = dur / total;
      const dx = (Math.random() - 0.5) * 70, dy = -l.y + Math.random() * 4 - 1;
      const sw = 8 + Math.random() * 14, r = (Math.random() - 0.5) * 540;
      const tf = (x, y, a) => `translate(${F(x)}px,${F(y)}px) rotate(${F(a)}deg)`;
      l.anim = l.fall.animate([
        { offset: 0, transform: tf(0, 0, 0), opacity: 1, easing: "ease-in" },
        { offset: k * 0.3, transform: tf(dx * 0.3 + sw, dy * 0.3, r * 0.3), opacity: 1, easing: "ease-in-out" },
        { offset: k * 0.65, transform: tf(dx * 0.65 - sw, dy * 0.66, r * 0.66), opacity: 1, easing: "ease-in-out" },
        { offset: k, transform: tf(dx, dy, r), opacity: 1 },
        { offset: k + (1 - k) * 0.45, transform: tf(dx, dy, r), opacity: 1 },
        { offset: 1, transform: tf(dx, dy, r), opacity: 0 }
      ], { duration: total, delay, fill: "forwards" });
    });
  }
  undry() {
    const M = this.M;
    this.isDry = false;
    this.els?.svg.classList.remove(TREE_CLASS.dry);
    [...M.leaves, M.sproutLeaf].forEach((l) => {
      if (l.anim) {
        l.anim.cancel();
        l.anim = null;
      }
      if (l.fallen) {
        const g = l.grow;
        g.style.transition = "none";
        g.style.transform = "scale(.001) rotate(-35deg)";
        g.style.opacity = "0";
        l.fallen = false;
      }
    });
    this.els?.svg.getBoundingClientRect();
  }
  /* ---------- cámara: siempre hacia delante, zoom proporcional a lo nuevo ---------- */
  targetCam() {
    const M = this.M;
    const bbox = (pts2) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      pts2.forEach(([x, y]) => {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      });
      return { x0, y0, x1, y1 };
    };
    const square = (pts2, minSize, pad) => {
      const b = bbox(pts2), size = Math.max(Math.max(b.x1 - b.x0, b.y1 - b.y0) * pad, minSize);
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      return { x: cx - size / 2, y: cy - size / 2, w: size, h: size };
    };
    if (this.isDry || this.camMode === "full") {
      const st = this.isDry ? TOTAL_STEPS : this.step;
      const pts2 = [[-20, 0], [20, 0]];
      M.br.forEach((b2) => {
        const g = gTarget(b2, st);
        if (g > 0) b2.pts.forEach((p, i) => {
          if (b2.s[i] <= g * b2.L + 1e-6) pts2.push(p);
        });
      });
      M.roots.forEach((r) => {
        if (gTarget(r, st) > 0) pts2.push(...r.pts);
      });
      const b = bbox(pts2), w = b.x1 - b.x0, h = b.y1 - b.y0, pad = Math.max(w, h) * 0.07 + 4;
      return { x: b.x0 - pad, y: b.y0 - pad, w: w + 2 * pad, h: h + 2 * pad };
    }
    if (this.step === 0) return { ...SPROUT_BOX };
    if (this.step === 1) return square([...M.br[0].pts, [0, 24]], 0, 1.2);
    const P = M.lineage[this.step - 2];
    const pts = [P.pts[P.pts.length - 1]];
    const kids = P.kids.filter((k) => !k.twig);
    kids.forEach((k) => pts.push(...k.pts));
    const avg = kids.reduce((s, k) => s + k.L, 0) / kids.length;
    return square(pts, avg * 2.3, 1.18);
  }
  setVB(c) {
    this.els?.svg.setAttribute("viewBox", `${F(c.x)} ${F(c.y)} ${F(c.w)} ${F(c.h)}`);
  }
  camera(forceDur) {
    const to = this.targetCam(), from = { ...this.cam };
    cancelAnimationFrame(this.camRaf);
    if (this.reduce) {
      this.cam = to;
      this.setVB(to);
      return;
    }
    const c0 = [from.x + from.w / 2, from.y + from.h / 2], c1 = [to.x + to.w / 2, to.y + to.h / 2];
    const lw = Math.log(to.w / from.w), lh = Math.log(to.h / from.h);
    const dist = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) / Math.max(from.w, to.w);
    const dur = forceDur ?? Math.min(3200, 1400 + Math.abs(lw) * 380 + dist * 500);
    const t0 = performance.now();
    const frame = (now) => {
      const k = Math.min(1, (now - t0) / dur), e = easeInOut(k);
      const w = from.w * Math.exp(lw * e), h = from.h * Math.exp(lh * e);
      const u = Math.abs(lw) > 0.05 ? (w - from.w) / (to.w - from.w) : e;
      this.cam = { x: c0[0] + (c1[0] - c0[0]) * u - w / 2, y: c0[1] + (c1[1] - c0[1]) * u - h / 2, w, h };
      this.setVB(this.cam);
      if (k < 1) this.camRaf = requestAnimationFrame(frame);
    };
    this.camRaf = requestAnimationFrame(frame);
  }
};

// arbol/mountArbol.ts
var CSS = `
.arbol-svg .${TREE_CLASS.sil}{fill:var(--arbol-ink,#141210);transition:fill 3s ease}
.arbol-svg svg.${TREE_CLASS.dry} .arbol-branches .${TREE_CLASS.sil},
.arbol-svg svg.${TREE_CLASS.dry} .arbol-roots .${TREE_CLASS.sil}{fill:var(--arbol-ink-dry,#6f665c)}
.arbol-svg .${TREE_CLASS.gline}{fill:none;stroke:var(--arbol-ink,#141210);stroke-width:1.4px;vector-effect:non-scaling-stroke;stroke-linecap:round;stroke-linejoin:round}
.arbol-svg .${TREE_CLASS.soil}{fill:none;stroke:var(--arbol-ink,#141210);stroke-width:1px;vector-effect:non-scaling-stroke;stroke-linecap:round;opacity:.35}
.arbol-svg .${TREE_CLASS.fall}{transform-box:fill-box;transform-origin:50% 50%}
.arbol-svg .${TREE_CLASS.grow}{transform-box:fill-box;transform-origin:0% 50%;transform:scale(.001) rotate(-35deg);opacity:0}
.arbol-svg .${TREE_CLASS.leaf}{fill:var(--arbol-ink,#141210)}
.arbol-svg .arbol-svg__wrap{position:absolute;inset:0;transition:transform 1.8s cubic-bezier(.45,0,.25,1)}
@media (prefers-reduced-motion: reduce){.arbol-svg .arbol-svg__wrap{transition:none}}
`;
var NS2 = "http://www.w3.org/2000/svg";
function mountArbol(host, controller, ariaLabel = "\xC1rbol que crece con las decisiones") {
  const root = document.createElement("div");
  root.className = "arbol-svg";
  root.style.cssText = "position:relative;overflow:hidden;width:100%;height:100%";
  const style = document.createElement("style");
  style.textContent = CSS;
  root.appendChild(style);
  const wrap = document.createElement("div");
  wrap.className = "arbol-svg__wrap";
  root.appendChild(wrap);
  const svg = document.createElementNS(NS2, "svg");
  svg.setAttribute("viewBox", "-40 -44 80 80");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", ariaLabel);
  svg.style.cssText = "width:100%;height:100%;display:block";
  const mk = (cls) => {
    const g = document.createElementNS(NS2, "g");
    if (cls) g.setAttribute("class", cls);
    svg.appendChild(g);
    return g;
  };
  const soil = mk(), roots = mk("arbol-roots"), ground = mk(), branches = mk("arbol-branches"), leaves = mk();
  wrap.appendChild(svg);
  host.appendChild(root);
  controller.attach({ wrap, svg, soil, roots, ground, branches, leaves });
  return () => {
    controller.detach();
    root.remove();
  };
}
export {
  TOTAL_STEPS,
  TreeController,
  mountArbol
};
