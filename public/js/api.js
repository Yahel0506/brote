// Cliente del backend. Para servir el frontend desde otro dominio, define
// <meta name="api-base" content="https://tu-servidor.com"> en index.html.

const base = (document.querySelector('meta[name="api-base"]')?.content ?? '').replace(/\/$/, '');

// Modo preview: si la página trae el contenido incrustado (window.__BROTE_CONTENT__), no hay backend.
export async function fetchContent() {
  if (window.__BROTE_CONTENT__) {
    const c = window.__BROTE_CONTENT__;
    return { content: { meta: c.meta ?? {}, game: c.game ?? {}, questions: c.questions ?? [], endings: c.endings ?? [], flows: c.flows ?? {} }, report: { errors: [], warnings: [] } };
  }
  const res = await fetch(`${base}/api/content`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`El servidor respondió ${res.status} en /api/content.`);
  const data = await res.json();
  const report = data.report ?? { errors: [], warnings: [] };
  if (report.errors?.length) console.warn('[contenido] errores:\n' + report.errors.join('\n'));
  if (report.warnings?.length) console.info('[contenido] advertencias:\n' + report.warnings.join('\n'));
  return {
    content: {
      meta: data.meta ?? {},
      game: data.game ?? {},
      questions: data.questions ?? [],
      endings: data.endings ?? [],
      flows: data.flows ?? {},
    },
    report,
  };
}
