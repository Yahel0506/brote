// Escenas: todo el contenido textual vive aquí y se reemplaza con fundidos,
// mientras el árbol permanece en su propia capa.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const motion = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.3 : 1);

const LINE = (cls = 'scribble') =>
  `<svg class="${cls}" viewBox="0 0 240 12" preserveAspectRatio="none" aria-hidden="true"><path d="M3 7 C 45 3, 92 10, 140 6 S 214 4, 237 7" pathLength="1"/></svg>`;
const RING =
  '<svg class="ring" viewBox="0 0 200 70" preserveAspectRatio="none" aria-hidden="true"><path d="M34 11 C 74 1, 152 3, 182 17 C 201 29, 193 52, 161 60 C 121 69, 50 67, 22 55 C 3 45, 6 22, 38 9" pathLength="1"/></svg>';
const LEAF =
  '<svg class="leaf-icon" viewBox="-1 -5 14 10" aria-hidden="true"><path d="M0 0 C2.6 -3.4 8.2 -3.8 12 0 C8.2 3.5 2.6 3.1 0 0 Z"/></svg>';

const btn = (action, label, primary = false) =>
  `<button type="button" class="link-btn${primary ? ' is-primary' : ''}" data-action="${action}"><span>${esc(label)}</span>${primary ? RING : LINE()}</button>`;

const echoList = (echoes) =>
  `<ul class="echo-list">${echoes
    .map(
      (e) =>
        `<li>${LEAF}<span><span class="echo-text">${esc(e.text)}</span>${
          e.deltas ? `<span class="echo-deltas hand">${esc(e.deltas)}</span>` : ''
        }</span></li>`
    )
    .join('')}</ul>`;

// Las cuatro curvas comparten escala para poder compararse entre sí.
function spark(values, lo, hi) {
  if (values.length < 2) return '';
  const range = Math.max(10, hi - lo);
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(1)} ${(22 - ((v - lo) / range) * 20).toFixed(1)}`);
  return `<svg class="spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><path d="M${pts.join(' L')}"/></svg>`;
}

export class Scenes {
  constructor(root) {
    this.root = root;
    this.handlers = {};
    this.waiters = new Map();
    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-action]');
      if (!t || t.disabled || !root.contains(t)) return;
      const action = t.dataset.action;
      const waiter = this.waiters.get(action);
      if (waiter) {
        this.waiters.delete(action);
        waiter({ ...t.dataset });
        return;
      }
      this.handlers[action]?.({ ...t.dataset }, t);
    });
  }

  waitFor(action) {
    return new Promise((res) => this.waiters.set(action, res));
  }

  /** Espera `ms`, o menos si la persona pulsa Enter para adelantar. */
  async hold(ms) {
    let timer;
    await Promise.race([new Promise((r) => (timer = setTimeout(r, ms))), this.waitFor('next')]);
    clearTimeout(timer);
    this.waiters.delete('next');
  }

  cancelWaiters() {
    for (const res of this.waiters.values()) res(null);
    this.waiters.clear();
  }

  async render(layout, html, handlers = {}) {
    this.handlers = {};
    await this.leave();
    this.root.dataset.layout = layout;
    const inner = document.createElement('div');
    inner.className = 'scene-inner';
    inner.innerHTML = html;
    this.root.appendChild(inner);
    void inner.offsetWidth;
    inner.classList.add('is-in');
    this.handlers = handlers;
    return inner;
  }

  async leave() {
    const olds = [...this.root.querySelectorAll('.scene-inner')];
    if (!olds.length) return;
    olds.forEach((o) => o.classList.add('is-leaving'));
    await wait(560 * motion());
    olds.forEach((o) => o.remove());
  }

  async clear() {
    this.cancelWaiters();
    this.handlers = {};
    await this.leave();
    this.root.dataset.layout = 'empty';
  }

  /* ───── Pantallas ───── */

  intro(o, handlers) {
    let actions;
    if (!o.hasQuestions) {
      actions = '<p class="notice">Aún no hay preguntas. Agrega archivos JSON en <code>data/questions/</code> y recarga la página.</p>';
    } else if (o.resumable) {
      actions = `${btn('continue', 'Continuar', true)}${btn('start', 'Empezar otra vida')}`;
    } else {
      actions = btn('start', 'Comenzar', true);
    }
    return this.render(
      'intro',
      `<section class="intro">
        <header class="intro-head">
          <h1 class="title hand rise" style="--d:2">${esc(o.title)}</h1>
          <div class="title-line rise" style="--d:3">${LINE()}</div>
          <p class="phrase rise" style="--d:4">${esc(o.phrase)}</p>
        </header>
        <div class="intro-spacer" aria-hidden="true"></div>
        <div class="intro-actions rise" style="--d:7">${actions}</div>
        ${o.problems ? `<p class="notice small rise" style="--d:8">Hay ${o.problems} problema(s) en los JSON. Revisa la consola o <code>/api/report</code>.</p>` : ''}
      </section>`,
      handlers
    );
  }

  error(message, handlers) {
    return this.render(
      'intro',
      `<section class="intro">
        <header class="intro-head">
          <h1 class="title hand rise" style="--d:1">Sin contenido</h1>
          <p class="phrase rise" style="--d:2">No se pudieron cargar las preguntas del servidor.</p>
          <p class="notice rise" style="--d:3">${esc(message)}</p>
        </header>
        <div class="intro-spacer"></div>
        <div class="intro-actions rise" style="--d:4">${btn('retry', 'Reintentar', true)}</div>
      </section>`,
      handlers
    );
  }

  stage(o) {
    const hasEchoes = o.echoes.length > 0;
    return this.render(
      'play',
      `<section class="panel stage-card">
        <p class="kicker hand rise" style="--d:0">etapa ${o.number} de ${o.total}</p>
        <h2 class="stage-title hand rise" style="--d:1">${esc(o.label)}</h2>
        <div class="title-line rise" style="--d:2">${LINE()}</div>
        ${o.subtitle ? `<p class="stage-sub rise" style="--d:3">${esc(o.subtitle)}</p>` : ''}
        ${
          hasEchoes
            ? `<div class="echoes rise" style="--d:5"><p class="echoes-title hand">lo que vuelve</p>${echoList(o.echoes)}</div>`
            : ''
        }
      </section>`
    );
  }

  question(view, handlers) {
    const answers = view.answers
      .map(
        (a, i) => `<li class="rise" style="--d:${3 + i}">
          <button type="button" class="answer${a.available ? '' : ' is-locked'}" data-action="choose" data-id="${esc(a.id)}"${
            a.available ? '' : ' disabled aria-disabled="true"'
          }>
            <span class="answer-key hand" aria-hidden="true">${i + 1}</span>
            <span class="answer-text">${esc(a.text)}</span>
            ${a.available ? '' : `<span class="answer-lock hand">${esc(a.lockReason)}</span>`}
            ${LINE('answer-line')}
          </button>
        </li>`
      )
      .join('');
    return this.render(
      'play',
      `<section class="panel question">
        <p class="kicker hand rise" style="--d:0">${esc(view.stage.label)}</p>
        <h2 class="q-text rise" style="--d:1">${esc(view.text)}</h2>
        ${view.context ? `<p class="q-context rise" style="--d:2">${esc(view.context)}</p>` : ''}
        <ol class="answers">${answers}</ol>
        <div class="q-after" aria-live="polite"></div>
      </section>`,
      handlers
    );
  }

  markChosen(answerId) {
    const list = this.root.querySelector('.answers');
    if (!list) return;
    list.classList.add('is-resolved');
    list.querySelectorAll('.answer').forEach((b) => {
      b.disabled = true;
      if (b.dataset.id === answerId) b.classList.add('is-chosen');
    });
  }

  showAfter({ outcome, echoes }) {
    const box = this.root.querySelector('.q-after');
    if (!box) return;
    // Tocar el resultado adelanta a la siguiente pregunta (equivale a Enter).
    box.dataset.action = 'next';
    box.innerHTML = `${outcome ? `<p class="outcome late" style="--d:0">${esc(outcome)}</p>` : ''}${
      echoes.length ? `<div class="echoes late" style="--d:1">${echoList(echoes)}</div>` : ''
    }`;
    void box.offsetWidth;
    requestAnimationFrame(() => box.querySelectorAll('.late').forEach((n) => n.classList.add('on')));
  }

  final(summary, handlers) {
    const s = summary;
    const all = s.stats.flatMap((x) => x.history);
    const lo = Math.max(0, Math.min(...all) - 4);
    const hi = Math.min(100, Math.max(...all) + 4);
    const stats = s.stats
      .map(
        (x) => `<li>
          <span class="fs-label hand">${esc(x.label)}</span>
          <span class="fs-spark">${spark(x.history, lo, hi)}</span>
          <span class="fs-value">${x.value}</span>
          <span class="fs-band">${esc(x.band)}</span>
        </li>`
      )
      .join('');
    const echoes = s.echoes.length
      ? `<div class="final-echoes rise" style="--d:7">
          <p class="echoes-title hand">ecos</p>
          ${echoList(
            s.echoes.map((e) => ({
              text: `Lo que elegiste en ${e.from} («${e.answer}») volvió durante ${e.to}.${e.message ? ` ${e.message}` : ''}`,
            }))
          )}
        </div>`
      : '';
    return this.render(
      'final',
      `<section class="final">
        <h2 class="fin hand rise" style="--d:0">FIN</h2>
        <div class="title-line rise" style="--d:1">${LINE()}</div>
        ${s.closing.title ? `<p class="final-title hand rise" style="--d:2">${esc(s.closing.title)}</p>` : ''}
        <p class="final-text rise" style="--d:3">${esc(s.closing.text)}</p>
        <ul class="final-stats rise" style="--d:4" aria-label="Estadísticas finales">${stats}</ul>
        <div class="final-reflection rise" style="--d:5">${s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
        ${echoes}
        <p class="final-meta rise" style="--d:8">${s.decisions} decisiones en ${s.stagesLived} etapas de vida.</p>
        <div class="final-actions rise" style="--d:9">${btn('restart', 'Reiniciar', true)}</div>
      </section>`,
      handlers
    );
  }

  /* ───── Teclado ───── */

  pressAnswer(n) {
    const b = this.root.querySelectorAll('.answer')[n - 1];
    if (b && !b.disabled) b.click();
  }

  pressPrimary() {
    const next = this.waiters.get('next');
    if (next) {
      this.waiters.delete('next');
      next({});
      return;
    }
    this.root.querySelector('.scene-inner:not(.is-leaving) .link-btn.is-primary')?.click();
  }
}
