// Motor de la partida. Funciones puras: reciben (content, state) y devuelven un estado nuevo.
// No tocan el DOM, así que también se usan desde Node (tools/simulate.js).

import { statDefs, initialStats, applyEffects, diffStats } from './stats.js';
import { evaluate, describeLock } from './conditions.js';
import { rngFor, randomSeed, hashString } from './rng.js';

export const SAVE_VERSION = 1;

const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const uniq = (a) => [...new Set(a)];
const clone = (o) => structuredClone(o);

export const getStages = (content) => content.game?.stages ?? [];
export const getDefs = (content) => statDefs(content.game);
export const questionText = (q) => q?.question ?? q?.text ?? '';
export const findQuestion = (content, id) => content.questions.find((q) => q.id === id);
const stageIndexOf = (content, id) => getStages(content).findIndex((s) => s.id === id);
const getFlow = (content, stageId) => content.flows?.[stageId] ?? null;

/** Firma del contenido: si los JSON cambian, una partida guardada deja de ser reanudable. */
export const contentKey = (content) =>
  String(hashString([...content.questions.map((q) => q.id)].sort().join('|') + '#' + getStages(content).map((s) => s.id).join('|')));

const sortKey = (q) => (q.order != null ? q.order : 1e6 + (q._seq ?? 0));

export function createGame(content, seed = randomSeed()) {
  const defs = getDefs(content);
  const stats = initialStats(defs);
  return {
    version: SAVE_VERSION,
    seed,
    contentKey: contentKey(content),
    createdAt: Date.now(),
    stageIndex: -1,
    stage: null,
    step: 0,
    stats,
    decisions: [],
    unlockedEvents: [],
    blockedEvents: [],
    flags: [],
    pending: [],
    log: [],
    seen: [],
    stageCount: {},
    trends: Object.fromEntries(defs.map((d) => [d.id, { up: 0, down: 0 }])),
    firedRules: [],
    activeRules: [],
    missed: [],
    history: [{ step: 0, stats: { ...stats } }],
    flowNode: {},
    flowDone: [],
    current: null,
    finished: false,
    treeState: { seed, step: 0, events: [] },
  };
}

/* ───────────── Selección de preguntas ───────────── */

function answerAvailability(content, state, q) {
  const defs = getDefs(content);
  return (q.answers ?? []).map((a) => ({ a, r: evaluate(a.requires, state, defs) }));
}

export function candidates(content, state) {
  const defs = getDefs(content);
  return content.questions.filter(
    (q) =>
      q.stage === state.stage &&
      !state.seen.includes(q.id) &&
      !state.blockedEvents.includes(q.id) &&
      (!q.onlyIfUnlocked || state.unlockedEvents.includes(q.id)) &&
      evaluate(q.requires, state, defs).ok &&
      answerAvailability(content, state, q).some(({ r }) => r.ok)
  );
}

export function nextQuestion(content, state) {
  if (state.finished || !state.stage) return null;
  if (state.current) {
    const cur = findQuestion(content, state.current);
    if (cur) return cur;
  }
  const flow = getFlow(content, state.stage);
  if (flow) return flowQuestion(content, state, flow);
  const stage = getStages(content)[state.stageIndex];
  if (stage?.maxQuestions && (state.stageCount[state.stage] ?? 0) >= stage.maxQuestions) return null;

  const list = candidates(content, state);
  if (!list.length) return null;
  const top = Math.max(...list.map((q) => q.priority ?? 0));
  const pool = list.filter((q) => (q.priority ?? 0) === top).sort((a, b) => sortKey(a) - sortKey(b));
  if (stage?.pick === 'random') {
    const rng = rngFor(state.seed, 'pick', state.step);
    return pool[Math.floor(rng() * pool.length)];
  }
  return pool[0];
}

// En una etapa con flujo, la siguiente pregunta es el nodo al que apuntó la última respuesta.
function flowQuestion(content, state, flow) {
  if ((state.flowDone ?? []).includes(state.stage)) return null;
  const q = findQuestion(content, state.flowNode?.[state.stage] ?? flow.start);
  if (!q) return null;
  const defs = getDefs(content);
  return q.answers.some((a) => evaluate(a.requires, state, defs).ok) ? q : null;
}

/**
 * Resuelve qué sigue: la siguiente pregunta de la etapa actual o, si no hay,
 * entra a la siguiente etapa con preguntas disponibles (omitiendo las vacías).
 */
export function resolveNext(content, state) {
  let s = state;
  const consequences = [];
  let entered = false;
  let q = s.stageIndex >= 0 ? nextQuestion(content, s) : null;
  let i = s.stageIndex;
  while (!q) {
    i += 1;
    if (i >= getStages(content).length) return { state: s, question: null, entered, consequences, finished: true };
    const r = enterStage(content, s, i);
    s = r.state;
    consequences.push(...r.consequences);
    entered = true;
    q = nextQuestion(content, s);
  }
  return { state: s, question: q, entered, consequences, finished: false };
}

/* ───────────── Etapas ───────────── */

export function enterStage(content, state, index) {
  const s = clone(state);
  const stage = getStages(content)[index];
  if (!stage) return { state: s, consequences: [] };
  s.stageIndex = index;
  s.stage = stage.id;
  s.current = null;
  s.stageCount[stage.id] ??= 0;
  s.treeState.events.push({ t: 'stage', index, step: s.step, stats: { ...s.stats } });

  const consequences = [];
  const due = s.pending.filter((p) => {
    if (p.dueStage == null) return false;
    const idx = stageIndexOf(content, p.dueStage);
    return idx === -1 || idx <= index;
  });
  s.pending = s.pending.filter((p) => !due.includes(p));
  for (const p of due) {
    const c = fire(content, s, p, 'delayed');
    if (c) consequences.push(c);
  }
  consequences.push(...applyRules(content, s));
  return { state: s, consequences };
}

/* ───────────── Progreso (reparte el crecimiento del árbol) ───────────── */

/** Decisiones que faltan: las de la etapa actual son exactas; las de etapas futuras, una estimación. */
export function estimateRemaining(content, state) {
  const stages = getStages(content);
  let rem = 0;
  for (let i = Math.max(0, state.stageIndex); i < stages.length; i++) {
    const st = stages[i];
    const flow = getFlow(content, st.id);
    if (flow) {
      const req = flow.requiredChoices ?? 5;
      if (i !== state.stageIndex) rem += req;
      else if (!(state.flowDone ?? []).includes(st.id)) rem += Math.max(1, req - (state.stageCount[st.id] ?? 0));
      continue;
    }
    const cap = st.maxQuestions ?? Infinity;
    if (i === state.stageIndex) {
      const used = state.stageCount[st.id] ?? 0;
      rem += Math.max(0, Math.min(cap - used, candidates(content, state).length));
    } else {
      const qs = content.questions.filter((q) => q.stage === st.id);
      const sure = qs.filter((q) => !q.onlyIfUnlocked && !q.requires).length;
      rem += Math.min(cap, sure + Math.round((qs.length - sure) / 2));
    }
  }
  return rem;
}

/** Fracción 0..1 de la vida recorrida. */
export function progress(content, state) {
  const done = state.decisions.length;
  const rem = estimateRemaining(content, state);
  return done + rem > 0 ? done / (done + rem) : 1;
}

/* ───────────── Presentar y elegir ───────────── */

export function presentQuestion(content, state, questionId) {
  const s = clone(state);
  const q = findQuestion(content, questionId);
  if (!q) throw new Error(`Pregunta desconocida: ${questionId}`);
  const firstTime = s.current !== q.id;
  s.current = q.id;

  const answers = answerAvailability(content, s, q)
    .map(({ a, r }, index) => ({
      id: a.id,
      text: a.text,
      index,
      available: r.ok,
      hidden: !r.ok && !!a.hideIfLocked,
      lockReason: r.ok ? '' : a.lockedText ?? describeLock(r.reasons),
    }))
    .filter((a) => !a.hidden);

  if (firstTime) {
    for (const a of answers) {
      if (!a.available) s.missed.push({ questionId: q.id, answerId: a.id, stage: s.stage, step: s.step });
    }
  }

  const stage = getStages(content)[s.stageIndex] ?? {};
  return {
    state: s,
    view: {
      id: q.id,
      text: questionText(q),
      context: q.context ?? '',
      answers,
      stage: { id: stage.id, label: stage.label ?? stage.id, number: (s.stageCount[s.stage] ?? 0) + 1 },
    },
  };
}

export function choose(content, state, questionId, answerId) {
  const s = clone(state);
  const defs = getDefs(content);
  const q = findQuestion(content, questionId);
  if (!q) throw new Error(`Pregunta desconocida: ${questionId}`);
  const a = q.answers.find((x) => x.id === answerId);
  if (!a) throw new Error(`Respuesta desconocida: ${questionId}:${answerId}`);
  if (!evaluate(a.requires, s, defs).ok) throw new Error(`Respuesta no disponible: ${questionId}:${answerId}`);

  const before = { ...s.stats };
  const applied = applyEffects(s.stats, a.effects, defs);
  s.stats = applied.stats;
  trackTrends(s, a.effects);
  applyLinks(s, a);

  s.seen = uniq([...s.seen, q.id]);
  s.stageCount[s.stage] = (s.stageCount[s.stage] ?? 0) + 1;
  s.step += 1;
  s.current = null;
  s.decisions.push({
    step: s.step,
    stage: s.stage,
    questionId: q.id,
    answerId: a.id,
    effects: { ...(a.effects ?? {}) },
    deltas: applied.deltas,
    statsAfter: { ...s.stats },
  });

  if (getFlow(content, q.stage)) {
    s.flowNode ??= {};
    s.flowDone ??= [];
    if (a.next) s.flowNode[q.stage] = a.next;
    else s.flowDone = uniq([...s.flowDone, q.stage]);
  }

  arr(a.later ?? a.delayed).forEach((l, i) => {
    s.pending.push({
      id: `${q.id}:${a.id}:${i}`,
      dueStep: l.stage ? null : s.step + Math.max(1, l.after ?? 1),
      dueStage: l.stage ?? null,
      effects: l.effects ?? {},
      message: l.message ?? '',
      requires: l.requires ?? null,
      unlocks: l.unlocks,
      blocks: l.blocks,
      flags: l.flags,
      removeFlags: l.removeFlags,
      source: { questionId: q.id, answerId: a.id, stage: s.stage, step: s.step, question: questionText(q), answer: a.text },
    });
  });

  const consequences = [];
  const due = s.pending.filter((p) => p.dueStep != null && p.dueStep <= s.step);
  s.pending = s.pending.filter((p) => !due.includes(p));
  for (const p of due) {
    const c = fire(content, s, p, 'delayed');
    if (c) consequences.push(c);
  }
  consequences.push(...applyRules(content, s));

  s.history.push({ step: s.step, stats: { ...s.stats } });
  s.treeState.events.push({ t: 'grow', step: s.step, effects: { ...(a.effects ?? {}) }, stats: { ...s.stats } });

  return {
    state: s,
    result: {
      questionId: q.id,
      answerId: a.id,
      outcome: a.outcome ?? '',
      deltas: diffStats(before, s.stats),
      choiceDeltas: applied.deltas,
      consequences,
    },
  };
}

export function finish(content, state) {
  const s = clone(state);
  s.finished = true;
  s.current = null;
  s.finishedAt = Date.now();
  s.treeState.events.push({ t: 'end', step: s.step });
  return s;
}

/* ───────────── Internos ───────────── */

function trackTrends(s, effects) {
  for (const [k, v] of Object.entries(effects ?? {})) {
    s.trends[k] ??= { up: 0, down: 0 };
    if (v > 0) s.trends[k].up += 1;
    else if (v < 0) s.trends[k].down += 1;
  }
}

function applyLinks(s, src) {
  s.unlockedEvents = uniq([...s.unlockedEvents, ...arr(src.unlocks)]);
  s.blockedEvents = uniq([...s.blockedEvents, ...arr(src.blocks)]);
  const remove = new Set(arr(src.removeFlags));
  s.flags = uniq([...s.flags, ...arr(src.flags), ...arr(src.setFlags)]).filter((f) => !remove.has(f));
}

function fire(content, s, p, kind) {
  const defs = getDefs(content);
  if (p.requires && !evaluate(p.requires, s, defs).ok) return null;
  const { stats, deltas } = applyEffects(s.stats, p.effects, defs);
  s.stats = stats;
  trackTrends(s, p.effects);
  applyLinks(s, p);
  const entry = { kind, id: p.id, step: s.step, stage: s.stage, message: p.message ?? '', deltas, source: p.source ?? null };
  s.log.push(entry);
  return entry.message || Object.keys(deltas).length ? entry : null;
}

// Reglas globales (game.json → rules): se disparan al cumplirse su condición.
// Con "once": false pueden volver a dispararse después de que la condición deje de cumplirse.
function applyRules(content, s) {
  const defs = getDefs(content);
  const out = [];
  for (const rule of content.game?.rules ?? []) {
    if (!rule?.id || !rule.when) continue;
    const ok = evaluate(rule.when, s, defs).ok;
    const active = s.activeRules.includes(rule.id);
    if (!ok) {
      if (active) s.activeRules = s.activeRules.filter((r) => r !== rule.id);
      continue;
    }
    if (active) continue;
    if (rule.once !== false && s.firedRules.includes(rule.id)) continue;
    s.activeRules.push(rule.id);
    s.firedRules.push(rule.id);
    const c = fire(content, s, { ...rule, id: `rule:${rule.id}`, requires: null, source: null }, 'rule');
    if (c) out.push(c);
  }
  return out;
}
