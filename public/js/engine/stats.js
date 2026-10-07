// Estadísticas: definición, aplicación de efectos y lectura descriptiva.

export const STAT_MIN = 0;
export const STAT_MAX = 100;

export const DEFAULT_STATS = [
  { id: 'learning', label: 'Aprendizaje', initial: 50 },
  { id: 'wellbeing', label: 'Bienestar', initial: 50 },
  { id: 'relationships', label: 'Relaciones', initial: 50 },
  { id: 'resources', label: 'Recursos', initial: 50 },
];

export const clamp = (v, min = STAT_MIN, max = STAT_MAX) => Math.max(min, Math.min(max, v));

export function statDefs(game) {
  const list = Array.isArray(game?.stats) && game.stats.length ? game.stats : DEFAULT_STATS;
  return list.map((s) => ({
    id: s.id,
    label: s.label ?? s.id,
    initial: clamp(Number(s.initial ?? 50)),
    description: s.description ?? '',
  }));
}

export const initialStats = (defs) => Object.fromEntries(defs.map((d) => [d.id, d.initial]));

/** Aplica efectos con límites 0–100. Devuelve las nuevas stats y el cambio real (tras recortar). */
export function applyEffects(stats, effects, defs) {
  const next = { ...stats };
  const deltas = {};
  for (const d of defs) {
    const raw = Number(effects?.[d.id] ?? 0);
    if (!raw) continue;
    const before = next[d.id] ?? d.initial;
    const after = clamp(before + raw);
    next[d.id] = after;
    if (after !== before) deltas[d.id] = after - before;
  }
  return { stats: next, deltas };
}

export function diffStats(before, after) {
  const out = {};
  for (const k of Object.keys(after)) {
    const d = (after[k] ?? 0) - (before[k] ?? 0);
    if (d) out[k] = d;
  }
  return out;
}

export function mergeDeltas(list) {
  const out = {};
  for (const d of list) for (const [k, v] of Object.entries(d ?? {})) out[k] = (out[k] ?? 0) + v;
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return out;
}

export function band(v) {
  if (v < 20) return 'muy bajo';
  if (v < 40) return 'bajo';
  if (v < 60) return 'medio';
  if (v < 80) return 'alto';
  return 'muy alto';
}
