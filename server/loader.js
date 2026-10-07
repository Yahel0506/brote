import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { validateContent } from './validate.js';
import { isFlow, convertFlow } from './flows.js';

/**
 * Lee todo el contenido del juego desde dataDir:
 *   meta.json       → título, frase, créditos
 *   game.json       → estadísticas, etapas y reglas globales
 *   endings.json    → cierres posibles
 *   questions/*.json → preguntas (los archivos que empiezan con "_" se ignoran)
 */
export async function loadContent(dataDir) {
  const errors = [];

  const readJSON = async (file, fallback) => {
    try {
      return JSON.parse(await readFile(file, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return fallback;
      errors.push(`${path.relative(dataDir, file)}: ${err.message}`);
      return fallback;
    }
  };

  const meta = (await readJSON(path.join(dataDir, 'meta.json'), {})) ?? {};
  const game = await readJSON(path.join(dataDir, 'game.json'), null);
  const endingsRaw = await readJSON(path.join(dataDir, 'endings.json'), []);
  const endings = Array.isArray(endingsRaw) ? endingsRaw : endingsRaw?.endings ?? [];

  const qDir = path.join(dataDir, 'questions');
  let files = [];
  try {
    files = (await readdir(qDir)).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();
  } catch (err) {
    if (err.code !== 'ENOENT') errors.push(`questions/: ${err.message}`);
  }

  const questions = [];
  const flows = {};
  const flowWarnings = [];
  let seq = 0;
  for (const file of files) {
    const raw = await readJSON(path.join(qDir, file), null);
    if (raw == null) continue;
    if (isFlow(raw)) {
      const { flow, questions: qs } = convertFlow(raw, file, { errors, warnings: flowWarnings });
      if (flow) {
        if (flows[flow.stage]) errors.push(`questions/${file}: la etapa "${flow.stage}" ya tiene un flujo en ${flows[flow.stage].file}.`);
        else flows[flow.stage] = flow;
      }
      qs.forEach((q, i) => questions.push({ ...q, _source: file, _index: i, _seq: seq++ }));
      continue;
    }
    const list = Array.isArray(raw) ? raw : Array.isArray(raw.questions) ? raw.questions : null;
    if (!list) {
      errors.push(`questions/${file}: se esperaba un arreglo o un objeto { "questions": [...] }.`);
      continue;
    }
    const fileStage = Array.isArray(raw) ? undefined : raw.stage;
    list.forEach((q, i) => {
      if (!q || typeof q !== 'object') {
        errors.push(`questions/${file} › #${i + 1}: no es un objeto.`);
        return;
      }
      questions.push(normalizeQuestion(q, { file, index: i, seq: seq++, fileStage }));
    });
  }

  const gameOut = applyFlowSettings(game, flows, flowWarnings);
  const report = validateContent({ meta, game: gameOut, questions, endings });
  const valid = questions.filter((q) => !q._invalid);

  return {
    content: { meta, game: gameOut, questions: valid, endings, flows },
    report: {
      errors: [...errors, ...report.errors],
      warnings: [...flowWarnings, ...report.warnings],
      files,
      counts: { questions: valid.length, excluded: questions.length - valid.length },
    },
  };
}

// Valores iniciales desde los flujos ("initialStats" + "statOrder") y revisión del orden de etapas.
function applyFlowSettings(game, flows, warnings) {
  if (!game || typeof game !== 'object') return game;
  const stages = Array.isArray(game.stages) ? game.stages : [];
  const ids = stages.map((s) => s.id);
  const statIds = new Set((game.stats ?? []).map((s) => s.id));
  for (const f of Object.values(flows)) {
    if (!ids.includes(f.stage)) warnings.push(`${f.file}: la etapa "${f.stage}" no está en game.json → stages.`);
    const after = ids[ids.indexOf(f.stage) + 1] ?? null;
    if (ids.includes(f.stage) && f.nextStage !== after) {
      warnings.push(`${f.file}: "nextStage" es ${JSON.stringify(f.nextStage)}, pero en game.json sigue ${JSON.stringify(after)} (manda game.json).`);
    }
    for (const s of f.statOrder) if (statIds.size && !statIds.has(s)) warnings.push(`${f.file}: "${s}" no está en game.json → stats.`);
  }
  const init = Object.values(flows).find((f) => f.initialStats);
  if (!init || !Array.isArray(game.stats)) return game;
  const stats = game.stats.map((s) => {
    const k = init.statOrder.indexOf(s.id);
    return k >= 0 && init.initialStats[k] != null ? { ...s, initial: init.initialStats[k] } : s;
  });
  return { ...game, stats };
}

function normalizeQuestion(q, { file, index, seq, fileStage }) {
  const answers = Array.isArray(q.answers)
    ? q.answers.map((a, i) => ({ ...a, id: a?.id != null ? String(a.id) : String.fromCharCode(97 + i) }))
    : q.answers;
  return { ...q, stage: q.stage ?? fileStage, answers, _source: file, _index: index, _seq: seq };
}
