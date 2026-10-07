#!/usr/bin/env node
// Juega miles de partidas con el mismo motor del navegador para balancear el contenido.
//
//   npm run simulate                       → 2000 partidas eligiendo al azar
//   npm run simulate -- --runs 5000
//   npm run simulate -- --strategy learning   (maximiza una estadística)
//   npm run simulate -- --strategy balanced   (mantiene parejas las cuatro)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from '../server/loader.js';
import * as G from '../public/js/engine/engine.js';
import { buildSummary } from '../public/js/engine/reflection.js';
import { applyEffects } from '../public/js/engine/stats.js';
import { mulberry32 } from '../public/js/engine/rng.js';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const RUNS = Number(opt('runs', 2000));
const STRATEGY = opt('strategy', 'random');
const rng = mulberry32(Number(opt('seed', 42)));

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');
const { content, report } = await loadContent(dataDir);
if (report.errors.length) console.log(`⚠ ${report.errors.length} errores de contenido (npm run validate).\n`);
if (!content.questions.length) {
  console.log('No hay preguntas que simular.');
  process.exit(0);
}
const defs = G.getDefs(content);

function pick(state, q, available) {
  if (STRATEGY === 'random') return available[Math.floor(rng() * available.length)];
  const score = (a) => {
    const ans = q.answers.find((x) => x.id === a.id);
    const after = applyEffects(state.stats, ans.effects, defs).stats;
    if (STRATEGY === 'balanced') return Math.min(...defs.map((d) => after[d.id])) + rng() * 0.01;
    return (after[STRATEGY] ?? 0) + rng() * 0.01;
  };
  return available.reduce((best, a) => (score(a) > score(best) ? a : best));
}

const seen = new Map(content.questions.map((q) => [q.id, 0]));
const answerStats = new Map();
const endings = new Map();
const rules = new Map();
const finals = Object.fromEntries(defs.map((d) => [d.id, []]));
let decisionsTotal = 0;
let delayedTotal = 0;
let missedTotal = 0;

for (let r = 0; r < RUNS; r++) {
  let s = G.createGame(content, `sim-${r}`);
  for (let guard = 0; guard < 500; guard++) {
    const next = G.resolveNext(content, s);
    s = next.state;
    if (next.finished) break;
    const shown = G.presentQuestion(content, s, next.question.id);
    s = shown.state;
    seen.set(next.question.id, seen.get(next.question.id) + 1);
    for (const a of shown.view.answers) {
      const key = `${next.question.id}:${a.id}`;
      const st = answerStats.get(key) ?? { shown: 0, locked: 0, chosen: 0 };
      st.shown++;
      if (!a.available) st.locked++;
      answerStats.set(key, st);
    }
    const available = shown.view.answers.filter((a) => a.available);
    const choice = pick(s, next.question, available);
    answerStats.get(`${next.question.id}:${choice.id}`).chosen++;
    s = G.choose(content, s, next.question.id, choice.id).state;
  }
  s = G.finish(content, s);
  const summary = buildSummary(content, s);
  endings.set(summary.closing.id, (endings.get(summary.closing.id) ?? 0) + 1);
  for (const id of s.firedRules) rules.set(id, (rules.get(id) ?? 0) + 1);
  for (const d of defs) finals[d.id].push(s.stats[d.id]);
  decisionsTotal += s.decisions.length;
  delayedTotal += s.log.filter((e) => e.kind === 'delayed').length;
  missedTotal += s.missed.length;
}

const pct = (n) => `${((n / RUNS) * 100).toFixed(1)}%`;
const quant = (arr, q) => arr[Math.min(arr.length - 1, Math.floor(q * arr.length))];

console.log(`Simulación: ${RUNS} partidas · estrategia "${STRATEGY}"`);
console.log(`Promedio: ${(decisionsTotal / RUNS).toFixed(1)} decisiones, ${(delayedTotal / RUNS).toFixed(2)} consecuencias diferidas, ${(missedTotal / RUNS).toFixed(2)} caminos cerrados por partida.\n`);

console.log('Estadísticas finales');
console.log('  '.padEnd(16) + 'media   mín   p10   p50   p90   máx');
for (const d of defs) {
  const v = finals[d.id].sort((a, b) => a - b);
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  console.log(`  ${d.label.padEnd(14)}${mean.toFixed(1).padStart(5)} ${[v[0], quant(v, 0.1), quant(v, 0.5), quant(v, 0.9), v.at(-1)].map((x) => String(Math.round(x)).padStart(5)).join(' ')}`);
}

console.log('\nFinales');
for (const [id, n] of [...endings].sort((a, b) => b[1] - a[1])) console.log(`  ${id.padEnd(18)} ${pct(n)}`);

console.log('\nReglas disparadas');
if (!rules.size) console.log('  (ninguna)');
for (const [id, n] of [...rules].sort((a, b) => b[1] - a[1])) console.log(`  ${id.padEnd(18)} ${pct(n)}`);

console.log('\nAlcance de preguntas');
for (const q of content.questions) {
  const n = seen.get(q.id);
  console.log(`  ${q.id.padEnd(26)} ${pct(n).padStart(6)}${n === 0 ? '  ← nunca aparece' : ''}`);
}

const never = [...answerStats].filter(([, st]) => st.locked === st.shown);
const neverChosen = [...answerStats].filter(([, st]) => st.chosen === 0 && st.locked < st.shown);
if (never.length) {
  console.log('\nRespuestas que nunca estuvieron disponibles');
  never.forEach(([k]) => console.log(`  ${k}`));
}
if (STRATEGY === 'random' && neverChosen.length) {
  console.log('\nRespuestas disponibles pero nunca elegidas');
  neverChosen.forEach(([k]) => console.log(`  ${k}`));
}
