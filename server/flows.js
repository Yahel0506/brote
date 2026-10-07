// Formato de flujos (nodos): un archivo por etapa con "startNode" y "nodes".
// Cada opción apunta al siguiente nodo con "next" (null = fin de la etapa).
// Se convierte a preguntas normales del motor y se valida el grafo completo.

export const isFlow = (raw) => !!raw && typeof raw === 'object' && !Array.isArray(raw) && raw.nodes && typeof raw.nodes === 'object';

const RANGE_KEYS = ['gte', 'gt', 'lte', 'lt'];

// ¿Alguna opción del nodo estará siempre disponible, sin importar las estadísticas?
function covered(options) {
  if (options.some((o) => !o.when)) return true;
  const byStat = {};
  for (const o of options) (byStat[o.when.stat] ??= []).push(o.when);
  return Object.values(byStat).some((ws) => {
    const highs = ws.map((w) => w.gte ?? w.gt).filter((v) => v != null);
    const lows = ws.map((w) => w.lt ?? w.lte).filter((v) => v != null);
    return highs.some((h) => lows.some((l) => h <= l));
  });
}

export function convertFlow(raw, file, { errors, warnings }) {
  const where = `questions/${file}`;
  const out = { flow: null, questions: [] };
  const stage = raw.stage;
  const order = Array.isArray(raw.statOrder) ? raw.statOrder : null;
  if (!stage) { errors.push(`${where}: falta "stage".`); return out; }
  if (!order) { errors.push(`${where}: falta "statOrder".`); return out; }
  const nodes = raw.nodes;
  if (!nodes[raw.startNode]) { errors.push(`${where}: "startNode" ("${raw.startNode}") no existe en "nodes".`); return out; }
  if (Array.isArray(raw.scoreRange) && (raw.scoreRange[0] !== 0 || raw.scoreRange[1] !== 100)) {
    warnings.push(`${where}: "scoreRange" ${JSON.stringify(raw.scoreRange)} se ignora; el motor usa 0–100.`);
  }
  const qid = (n) => `${stage}/${n}`;

  for (const [nid, node] of Object.entries(nodes)) {
    const w = `${where} › ${nid}`;
    const options = Array.isArray(node.options) ? node.options : [];
    if (!node.prompt) errors.push(`${w}: falta "prompt".`);
    if (!options.length) { errors.push(`${w}: no tiene opciones.`); continue; }
    const answers = options.map((o, i) => {
      const ow = `${w} › opción "${o.id ?? i + 1}"`;
      const delta = o.outcome?.delta;
      if (!Array.isArray(delta) || delta.length !== order.length) {
        warnings.push(`${ow}: "delta" debería tener ${order.length} números (uno por estadística de statOrder).`);
      }
      const effects = {};
      order.forEach((stat, k) => {
        const v = Number(delta?.[k] ?? 0);
        if (v) effects[stat] = v;
      });
      let requires = null;
      let hideIfLocked = false;
      if (o.when) {
        const range = Object.fromEntries(RANGE_KEYS.filter((k) => o.when[k] != null).map((k) => [k, o.when[k]]));
        if (!o.when.stat || !Object.keys(range).length) errors.push(`${ow}: "when" necesita "stat" y "gte", "gt", "lte" o "lt".`);
        else requires = { stats: { [o.when.stat]: range } };
        // Las opciones "por debajo de" son variantes para quien tiene poco de algo, no oportunidades perdidas:
        // si no aplican, se ocultan en lugar de mostrarse bloqueadas.
        hideIfLocked = o.when.lt != null || o.when.lte != null;
      }
      if (o.next != null && !nodes[o.next]) errors.push(`${ow}: "next" apunta a "${o.next}", que no existe.`);
      return {
        id: String(o.id ?? String.fromCharCode(97 + i)),
        text: o.text,
        effects,
        outcome: o.outcome?.text ?? '',
        requires,
        hideIfLocked,
        next: o.next != null ? qid(o.next) : null,
      };
    });
    const isCovered = covered(options);
    if (!isCovered) warnings.push(`${w}: todas sus opciones tienen condición y puede quedarse sin opciones (la etapa terminaría ahí).`);
    out.questions.push({ id: qid(nid), stage, question: node.prompt, answers, _flow: true, _covered: isCovered });
  }

  // Recorre el grafo: largo de los caminos, ciclos y nodos inalcanzables.
  const memo = new Map();
  const visiting = new Set();
  const reach = new Set();
  const lengths = (nid) => {
    if (memo.has(nid)) return memo.get(nid);
    if (visiting.has(nid)) { errors.push(`${where}: hay un ciclo que pasa por "${nid}".`); return new Set(); }
    visiting.add(nid);
    reach.add(nid);
    const res = new Set();
    for (const o of nodes[nid]?.options ?? []) {
      if (o.next == null) res.add(1);
      else if (nodes[o.next]) for (const l of lengths(o.next)) res.add(l + 1);
    }
    visiting.delete(nid);
    memo.set(nid, res);
    return res;
  };
  const all = [...lengths(raw.startNode)].sort((a, b) => a - b);
  if (raw.requiredChoices != null && all.some((l) => l !== raw.requiredChoices)) {
    warnings.push(`${where}: hay caminos de ${all.join(', ')} decisiones; "requiredChoices" dice ${raw.requiredChoices}.`);
  }
  const unreachable = Object.keys(nodes).filter((n) => !reach.has(n));
  if (unreachable.length) warnings.push(`${where}: nodos a los que nunca se llega: ${unreachable.join(', ')}.`);

  out.flow = {
    stage,
    file,
    start: qid(raw.startNode),
    requiredChoices: raw.requiredChoices ?? (all.length ? Math.max(...all) : null),
    nextStage: raw.nextStage ?? null,
    statOrder: order,
    initialStats: Array.isArray(raw.initialStats) ? raw.initialStats : null,
  };
  return out;
}
