// Construye la lectura final de la partida. Describe la vida construida; nunca dice "ganaste" o "perdiste".

import { getDefs, getStages } from './engine.js';
import { band } from './stats.js';
import { evaluate } from './conditions.js';

const STAT_LINES_BASE = {
  learning: {
    high: 'Buena parte de tu tiempo se fue en aprender: preguntar, practicar, entender un poco más cada vez.',
    low: 'Aprender no fue el centro; la vida se fue llenando de otras urgencias.',
  },
  wellbeing: {
    high: 'Cuidaste tu cuerpo y tu calma con una constancia poco común.',
    low: 'El descanso casi siempre quedó para después.',
  },
  relationships: {
    high: 'Tu historia está llena de otras personas: las buscaste y te quedaste cerca.',
    low: 'Recorriste muchos tramos con poca compañía, por elección o por circunstancia.',
  },
  resources: {
    high: 'Construiste una base material firme, y eso te dio margen para elegir.',
    low: 'El dinero y el tiempo fueron escasos, y eso también decidió algunas cosas por ti.',
  },
};

const STAT_LINES = {
  ...STAT_LINES_BASE,
  aprendizaje: STAT_LINES_BASE.learning,
  bienestar: STAT_LINES_BASE.wellbeing,
  relaciones: STAT_LINES_BASE.relationships,
  recursos: STAT_LINES_BASE.resources,
};

const DEFAULT_CLOSING = {
  id: 'default',
  title: 'Una trayectoria',
  text: 'No hubo una sola decisión que lo definiera todo. Hubo muchas, pequeñas, que se fueron sumando hasta tomar esta forma.',
};

export function buildSummary(content, state) {
  const defs = getDefs(content);
  const stages = getStages(content);
  const stageLabel = (id) => stages.find((s) => s.id === id)?.label ?? id;

  const stats = defs.map((d) => {
    const value = Math.round(state.stats[d.id] ?? 0);
    return {
      id: d.id,
      label: d.label,
      value,
      band: band(value),
      history: (state.history ?? []).map((h) => h.stats[d.id] ?? 0),
    };
  });

  const sorted = [...stats].sort((a, b) => b.value - a.value);
  const top = sorted[0];
  const low = sorted.at(-1);
  const line = (s, kind) =>
    STAT_LINES[s.id]?.[kind] ??
    (kind === 'high' ? `${s.label} fue lo que más creció en tu recorrido.` : `${s.label} quedó en segundo plano.`);

  const paragraphs = [];
  if (top && low) {
    if (top.value - low.value <= 14) {
      paragraphs.push('Ninguna parte de tu vida se impuso sobre las demás: repartiste tu tiempo de forma pareja, sin grandes picos ni grandes huecos.');
    } else {
      paragraphs.push(line(top, 'high'));
      if (low.value < 45) paragraphs.push(line(low, 'low'));
    }
  }

  const missed = state.missed?.length ?? 0;
  if (missed === 1) {
    paragraphs.push('Hubo un camino que, cuando llegó, ya no estaba abierto para ti. No se cerró en ese momento: se había ido cerrando antes.');
  } else if (missed > 1) {
    paragraphs.push(`En ${missed} momentos hubo caminos que ya no estaban abiertos para ti. No se cerraron de golpe: se fueron cerrando con otras elecciones.`);
  }

  const echoes = (state.log ?? [])
    .filter((e) => e.kind === 'delayed' && e.source && e.source.stage !== e.stage)
    .slice(-3)
    .map((e) => ({
      from: stageLabel(e.source.stage),
      to: stageLabel(e.stage),
      question: e.source.question,
      answer: e.source.answer,
      message: e.message,
    }));

  const endings = (content.endings ?? [])
    .filter((e) => e && e.text)
    .map((e, i) => ({ ...e, _i: i }))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a._i - b._i);
  const closing = endings.find((e) => evaluate(e.requires, state, defs).ok) ?? DEFAULT_CLOSING;

  const stagesLived = new Set((state.decisions ?? []).map((d) => d.stage)).size;

  return {
    stats,
    closing: { id: closing.id ?? 'ending', title: closing.title ?? '', text: closing.text },
    paragraphs,
    echoes,
    decisions: state.decisions?.length ?? 0,
    stagesLived,
    missed,
  };
}
