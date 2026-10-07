// Valida el contenido cargado desde /data.
// Los errores invalidan la pregunta (se excluye del juego); las advertencias solo se reportan.

const DEFAULT_STATS = ['learning', 'wellbeing', 'relationships', 'resources'];
const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

export function validateContent({ game, questions = [], endings = [] }) {
  const errors = [];
  const warnings = [];

  if (!game || typeof game !== 'object') {
    errors.push('data/game.json no existe o no es un objeto válido.');
    return { errors, warnings };
  }

  const statIds = new Set(
    Array.isArray(game.stats) && game.stats.length ? game.stats.map((s) => s.id) : DEFAULT_STATS
  );
  const stages = Array.isArray(game.stages) ? game.stages : [];
  if (!stages.length) errors.push('game.json: "stages" debe tener al menos una etapa.');
  const stageIds = new Set(stages.map((s) => s.id));

  const flagsSet = new Set();
  const flagsUsed = [];
  const choseRefs = [];
  const linkRefs = [];
  const unlocked = new Set();

  const checkEffects = (effects, where) => {
    if (effects == null) return true;
    if (typeof effects !== 'object' || Array.isArray(effects)) {
      errors.push(`${where}: "effects" debe ser un objeto.`);
      return false;
    }
    let ok = true;
    for (const [k, v] of Object.entries(effects)) {
      if (!statIds.has(k)) warnings.push(`${where}: estadística desconocida "${k}" (se ignora).`);
      if (typeof v !== 'number' || Number.isNaN(v)) {
        errors.push(`${where}: el efecto "${k}" debe ser un número.`);
        ok = false;
      }
    }
    return ok;
  };

  const checkCond = (cond, where) => {
    if (cond == null) return true;
    if (typeof cond !== 'object' || Array.isArray(cond)) {
      errors.push(`${where}: "requires" debe ser un objeto.`);
      return false;
    }
    let ok = true;
    if (cond.stats) {
      for (const [k, r] of Object.entries(cond.stats)) {
        if (!statIds.has(k)) warnings.push(`${where}: condición sobre estadística desconocida "${k}".`);
        const range = typeof r === 'number' ? { min: r } : r;
        if (!range || ['min', 'max', 'gte', 'gt', 'lte', 'lt'].every((key) => range[key] == null)) {
          errors.push(`${where}: la condición de "${k}" necesita "min", "max", "gte", "gt", "lte" o "lt".`);
          ok = false;
        }
      }
    }
    for (const f of [...arr(cond.flags), ...arr(cond.notFlags)]) flagsUsed.push([f, where]);
    for (const c of [...arr(cond.chose), ...arr(cond.notChose)]) choseRefs.push([c, where]);
    for (const c of arr(cond.any)) ok = checkCond(c, `${where} (any)`) && ok;
    return ok;
  };

  const collectLinks = (obj, where) => {
    for (const id of arr(obj.unlocks)) { unlocked.add(id); linkRefs.push([id, where]); }
    for (const id of arr(obj.blocks)) linkRefs.push([id, where]);
    for (const f of [...arr(obj.flags), ...arr(obj.setFlags)]) flagsSet.add(f);
  };

  const ids = new Map();
  const perStage = new Map([...stageIds].map((s) => [s, 0]));

  for (const q of questions) {
    const w = `${q._source ?? '?'} › ${q.id ?? `#${(q._index ?? 0) + 1}`}`;
    if (!q.id || typeof q.id !== 'string') { errors.push(`${w}: falta "id".`); q._invalid = true; continue; }
    if (ids.has(q.id)) { errors.push(`${w}: id duplicado (también en ${ids.get(q.id)}).`); q._invalid = true; continue; }
    ids.set(q.id, q._source);
    if (!stageIds.has(q.stage)) { errors.push(`${w}: etapa desconocida "${q.stage}".`); q._invalid = true; }
    else perStage.set(q.stage, perStage.get(q.stage) + 1);
    if (!(q.question ?? q.text)) { errors.push(`${w}: falta el texto en "question".`); q._invalid = true; }
    if (!checkCond(q.requires, w)) q._invalid = true;
    if (!Array.isArray(q.answers) || !q.answers.length) {
      errors.push(`${w}: "answers" debe ser un arreglo con al menos una respuesta.`);
      q._invalid = true;
      continue;
    }
    if (q.answers.length < 2) warnings.push(`${w}: solo tiene una respuesta.`);
    const answerIds = new Set();
    let anyFree = false;
    q.answers.forEach((a, i) => {
      const aw = `${w} › respuesta "${a.id ?? i + 1}"`;
      if (!a.text) { errors.push(`${aw}: falta "text".`); q._invalid = true; }
      if (answerIds.has(a.id)) { errors.push(`${aw}: id de respuesta repetido.`); q._invalid = true; }
      answerIds.add(a.id);
      if (!checkEffects(a.effects, aw)) q._invalid = true;
      if (!checkCond(a.requires, aw)) q._invalid = true;
      if (!a.requires) anyFree = true;
      collectLinks(a, aw);
      arr(a.later ?? a.delayed).forEach((l, j) => {
        const lw = `${aw} › later[${j}]`;
        if (l.stage != null && !stageIds.has(l.stage)) warnings.push(`${lw}: etapa desconocida "${l.stage}" (se dispara al entrar a la siguiente etapa).`);
        if (l.after != null && !(Number.isInteger(l.after) && l.after >= 1)) { errors.push(`${lw}: "after" debe ser un entero ≥ 1.`); q._invalid = true; }
        if (!checkEffects(l.effects, lw)) q._invalid = true;
        checkCond(l.requires, lw);
        collectLinks(l, lw);
      });
    });
    if (!anyFree && !q._flow) warnings.push(`${w}: todas las respuestas tienen condiciones; si ninguna se cumple, la pregunta se salta.`);
  }

  for (const [i, r] of (Array.isArray(game.rules) ? game.rules : []).entries()) {
    const w = `game.json › rules[${r.id ?? i}]`;
    if (!r.id) errors.push(`${w}: falta "id".`);
    if (!r.when) errors.push(`${w}: falta "when".`);
    checkCond(r.when, w);
    checkEffects(r.effects, w);
    collectLinks(r, w);
  }

  for (const [i, e] of endings.entries()) {
    const w = `endings.json › ${e.id ?? `#${i + 1}`}`;
    if (!e.text) errors.push(`${w}: falta "text".`);
    checkCond(e.requires, w);
  }

  // Referencias cruzadas
  for (const q of questions) {
    if (!q._invalid && q.onlyIfUnlocked && !unlocked.has(q.id)) {
      warnings.push(`${q._source} › ${q.id}: tiene "onlyIfUnlocked" pero ninguna respuesta la desbloquea.`);
    }
  }
  for (const [id, w] of linkRefs) {
    if (!ids.has(id)) warnings.push(`${w}: "${id}" no es una pregunta conocida (válido solo si lo usas como evento).`);
  }
  for (const [ref, w] of choseRefs) {
    const [qid] = String(ref).split(':');
    if (!ids.has(qid)) warnings.push(`${w}: "chose" apunta a una pregunta inexistente "${qid}".`);
  }
  for (const [f, w] of flagsUsed) {
    if (!flagsSet.has(f)) warnings.push(`${w}: la bandera "${f}" nunca se activa en ningún lugar.`);
  }
  for (const [stage, n] of perStage) {
    if (!n) warnings.push(`La etapa "${stage}" no tiene preguntas: se omitirá.`);
  }

  return { errors, warnings: [...new Set(warnings)] };
}
