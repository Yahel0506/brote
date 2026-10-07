// Orquestador: conecta el motor (lógica), el árbol (visual) y las escenas (texto).
//
//   App
//   ├── PersistentTree  ← nunca se desmonta, solo recibe eventos nuevos
//   ├── Scenes          ← intro, etapas, preguntas, final
//   ├── StatsPanel      ← las cuatro estadísticas en vivo
//   └── Settings        ← capa superpuesta

import { fetchContent } from './api.js';
import * as G from './engine/engine.js';
import { buildSummary } from './engine/reflection.js';
import { mergeDeltas } from './engine/stats.js';
import { PersistentTree } from './tree/PersistentTree.js';
import { Scenes } from './ui/scenes.js';
import { StatsPanel } from './ui/statsPanel.js';
import { Settings } from './ui/settings.js';
import { Ambient } from './audio/ambient.js';
import { store } from './state/store.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const motion = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.3 : 1);
// Tiempo para leer un texto (~250 palabras por minuto), sin acelerarlo con movimiento reducido.
const readMs = (texts) => {
  const words = texts.filter(Boolean).join(' ').split(/\s+/).filter(Boolean).length;
  return words ? 1400 + words * 240 : 0;
};
const clip = (s, n = 60) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

const app = {
  content: null,
  report: { errors: [], warnings: [] },
  state: null,
  gen: 0, // cada flujo nuevo invalida al anterior (p. ej. al reiniciar)
  busy: null,
  restarting: false,
};

let tree, scenes, stats, settings, audio;
const alive = (g) => g === app.gen;

function guard(fn) {
  return async (...args) => {
    if (app.busy || app.restarting) return;
    const token = Symbol('busy');
    app.busy = token;
    try {
      await fn(...args);
    } catch (err) {
      console.error(err);
    } finally {
      if (app.busy === token) app.busy = null;
    }
  };
}

const save = () => app.state && store.save(app.state);

function syncTree() {
  const ms = tree.advance(G.progress(app.content, app.state), app.state.decisions.length);
  app.state.treeState.step = tree.step;
  return ms;
}

function formatEcho(c) {
  const defs = G.getDefs(app.content);
  const deltas = Object.entries(c.deltas ?? {})
    .map(([k, v]) => `${v > 0 ? '+' : '−'}${Math.abs(v)} ${defs.find((d) => d.id === k)?.label ?? k}`)
    .join(', ');
  const text =
    c.message ||
    (c.source ? `Lo que elegiste en «${clip(c.source.question)}» vuelve a notarse.` : 'Algo cambia, aunque hoy no lo hayas decidido.');
  return { text, deltas };
}

/* ───────────── Arranque ───────────── */

async function boot() {
  tree = new PersistentTree(document.getElementById('tree-layer'));
  scenes = new Scenes(document.getElementById('scene'));
  stats = new StatsPanel(document.getElementById('stats'));

  try {
    const { content, report } = await fetchContent();
    app.content = content;
    app.report = report;
  } catch (err) {
    console.error(err);
    tree.introduce();
    scenes.error(err.message, { retry: () => location.reload() });
    return;
  }

  const meta = app.content.meta;
  if (meta.title) document.title = meta.title;

  const prefs = store.prefs();
  audio = new Ambient({ src: meta.music?.src });
  audio.enabled = prefs.music;
  audio.volume = prefs.volume;

  settings = new Settings(document.getElementById('settings'), document.getElementById('settings-toggle'), {
    meta,
    prefs,
    canRestart: () => !!app.state,
    onMusic: (on) => {
      prefs.music = on;
      store.savePrefs(prefs);
      audio.setEnabled(on);
    },
    onVolume: (v) => {
      prefs.volume = v;
      store.savePrefs(prefs);
      audio.setVolume(v);
    },
    onRestart: () => restart(),
  });

  stats.build(G.getDefs(app.content));
  tree.introduce();
  bindKeys();
  showIntro();
}

function bindKeys() {
  document.addEventListener('keydown', (e) => {
    if (settings?.isOpen) {
      if (e.key === 'Escape') settings.close();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^[1-9]$/.test(e.key)) scenes.pressAnswer(Number(e.key));
    else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) scenes.pressPrimary();
  });
}

/* ───────────── Flujo ───────────── */

function showIntro() {
  const saved = store.load();
  const resumable = saved && !saved.finished && saved.contentKey === G.contentKey(app.content) ? saved : null;
  tree.setPosition('center');
  stats.hide();
  scenes.intro(
    {
      title: app.content.meta.title ?? 'Brote',
      phrase: app.content.meta.phrase ?? 'Tú no eres tu contexto, sino tus decisiones.',
      resumable: !!resumable,
      hasQuestions: app.content.questions.length > 0,
      problems: app.report.errors?.length ?? 0,
    },
    {
      start: guard(start),
      continue: guard(() => resume(resumable)),
    }
  );
}

async function start() {
  const g = ++app.gen;
  store.clear();
  app.state = G.createGame(app.content, tree.seedKey);
  audio.start();
  stats.set(app.state.stats);
  await scenes.clear();
  tree.setPosition('right');
  await wait(1700 * motion());
  if (alive(g)) await advance(g);
}

async function resume(saved) {
  if (!saved) return start();
  const g = ++app.gen;
  app.state = saved;
  audio.start();
  await scenes.clear();
  const step = saved.treeState.step ?? tree.stepFor(G.progress(app.content, saved), saved.decisions.length);
  const regrow = await tree.rebuild(saved.seed, step);
  tree.setPosition('right');
  stats.set(saved.stats);
  stats.show();
  await wait(Math.max(1700, Math.min(regrow, 4500)) * motion());
  if (alive(g)) await advance(g);
}

/** Muestra lo siguiente: tarjeta de etapa (si cambió) y la pregunta. */
async function advance(g) {
  const next = G.resolveNext(app.content, app.state);
  app.state = next.state;
  if (next.finished) return finish(g);
  save();

  if (next.entered) {
    const stages = G.getStages(app.content);
    const stage = stages[app.state.stageIndex];
    const echoes = next.consequences.map(formatEcho);
    stats.show();
    stats.set(app.state.stats, mergeDeltas(next.consequences.map((c) => c.deltas)));
    const growMs = syncTree();
    await scenes.stage({
      number: app.state.stageIndex + 1,
      total: stages.length,
      label: stage.label ?? stage.id,
      subtitle: stage.subtitle ?? '',
      echoes,
    });
    if (!alive(g)) return;
    const read = readMs([stage.subtitle, ...echoes.map((e) => e.text)]);
    await scenes.hold(Math.max(Math.max(3200, growMs + 700) * motion(), Math.min(read, 9000)));
    if (!alive(g)) return;
  }

  const shown = G.presentQuestion(app.content, app.state, next.question.id);
  app.state = shown.state;
  save();
  stats.show();
  await scenes.question(shown.view, {
    choose: guard(({ id }) => onChoose(shown.view, id, g)),
  });
}

async function onChoose(view, answerId, g) {
  if (!alive(g)) return;
  const answer = view.answers.find((a) => a.id === answerId);
  if (!answer?.available) return;

  const { state, result } = G.choose(app.content, app.state, view.id, answerId);
  app.state = state;

  scenes.markChosen(answerId);
  audio.chime();
  stats.set(state.stats, result.deltas);
  const growMs = syncTree();
  save();
  const echoes = result.consequences.map(formatEcho);

  // La siguiente pregunta aparece sola: el resultado se queda el tiempo justo para leerlo
  // (Enter lo adelanta).
  if (result.outcome || echoes.length) {
    await wait(500 * motion());
    if (!alive(g)) return;
    scenes.showAfter({ outcome: result.outcome, echoes });
    const read = readMs([result.outcome, ...echoes.map((e) => e.text)]);
    await scenes.hold(Math.min(Math.max(read, Math.min(growMs, 2600) * motion()), 7000));
  } else {
    await wait(Math.min(Math.max(growMs, 1600), 2600) * motion());
  }
  if (alive(g)) await advance(g);
}

async function finish(g) {
  app.state = G.finish(app.content, app.state);
  save();
  await scenes.clear();
  stats.hide();
  if (!alive(g)) return;
  await tree.wither();
  if (!alive(g)) return;
  tree.setPosition('left');
  await wait(2000 * motion());
  if (!alive(g)) return;
  await scenes.final(buildSummary(app.content, app.state), { restart: () => restart() });
}

async function restart() {
  if (app.restarting) return;
  app.restarting = true;
  const g = ++app.gen;
  app.busy = null;
  settings?.close();
  await scenes.clear();
  stats.hide();
  store.clear();
  app.state = null;
  if (tree.hasGrowth()) await tree.retract();
  tree.setPosition('center');
  await wait(1500 * motion());
  app.restarting = false;
  if (alive(g)) showIntro();
}

boot();
