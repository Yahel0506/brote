// Condiciones declarativas usadas por preguntas, respuestas, consecuencias, reglas y finales.
//
// {
//   "stats":    { "aprendizaje": { "min": 60 }, "bienestar": { "lt": 30 } },  // min/max/gte/lte inclusivos; gt/lt estrictos
//   "flags":    ["pasion"],            // todas deben estar activas
//   "notFlags": ["agotamiento"],       // ninguna debe estar activa
//   "chose":    ["teen_exam_01:bloques", "teen_friend_01"],  // pregunta[:respuesta]
//   "notChose": ["..."],
//   "unlocked": ["evento_x"],
//   "trend":    { "wellbeing": { "down": 3 } },  // veces que bajó / subió (up)
//   "any":      [ {condición}, {condición} ]     // basta con que una se cumpla
// }

const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const PATH = 'un camino anterior distinto';

export function decisionMatches(state, ref) {
  const [qid, aid] = String(ref).split(':');
  return (state.decisions ?? []).some((d) => d.questionId === qid && (aid == null || d.answerId === aid));
}

export function evaluate(cond, state, defs = []) {
  if (!cond) return { ok: true, reasons: [] };
  const reasons = [];
  const label = (id) => defs.find((d) => d.id === id)?.label ?? id;

  if (cond.stats) {
    for (const [id, rule] of Object.entries(cond.stats)) {
      const r = typeof rule === 'number' ? { min: rule } : rule ?? {};
      const v = state.stats?.[id] ?? 0;
      const min = r.min ?? r.gte;
      const max = r.max ?? r.lte;
      if (min != null && v < min) reasons.push(`${label(id)} de ${min} o más`);
      if (max != null && v > max) reasons.push(`${label(id)} de ${max} o menos`);
      if (r.gt != null && !(v > r.gt)) reasons.push(`${label(id)} mayor que ${r.gt}`);
      if (r.lt != null && !(v < r.lt)) reasons.push(`${label(id)} por debajo de ${r.lt}`);
    }
  }

  const flags = state.flags ?? [];
  if (arr(cond.flags).some((f) => !flags.includes(f))) reasons.push(PATH);
  if (arr(cond.notFlags).some((f) => flags.includes(f))) reasons.push(PATH);
  if (arr(cond.chose).some((r) => !decisionMatches(state, r))) reasons.push(PATH);
  if (arr(cond.notChose).some((r) => decisionMatches(state, r))) reasons.push(PATH);
  if (arr(cond.unlocked).some((id) => !(state.unlockedEvents ?? []).includes(id))) reasons.push(PATH);

  if (cond.trend) {
    for (const [id, t] of Object.entries(cond.trend)) {
      const tr = state.trends?.[id] ?? { up: 0, down: 0 };
      if (t?.up != null && tr.up < t.up) reasons.push(PATH);
      if (t?.down != null && tr.down < t.down) reasons.push(PATH);
    }
  }

  const any = arr(cond.any);
  if (any.length) {
    const results = any.map((c) => evaluate(c, state, defs));
    if (!results.some((r) => r.ok)) reasons.push(...results[0].reasons);
  }

  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export function describeLock(reasons) {
  if (!reasons.length) return '';
  const list = reasons.length === 1 ? reasons[0] : `${reasons.slice(0, -1).join(', ')} y ${reasons.at(-1)}`;
  return `requiere ${list}`;
}
