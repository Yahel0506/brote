import { esc } from './scenes.js';

const TRACK = 'M1 4 C 22 2.8, 48 5.2, 72 3.6 S 92 4.2, 99 3.8';

export class StatsPanel {
  constructor(root) {
    this.root = root;
    this.items = new Map();
  }

  build(defs) {
    this.root.innerHTML = defs
      .map(
        (d) => `<div class="stat" data-stat="${esc(d.id)}">
          <span class="stat-label hand">${esc(d.label)}</span>
          <div class="stat-row">
            <svg class="stat-bar" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
              <path class="track" d="${TRACK}" pathLength="100"/>
              <path class="fill" d="${TRACK}" pathLength="100"/>
            </svg>
            <span class="stat-value">0</span>
          </div>
          <span class="stat-delta hand" aria-hidden="true"></span>
        </div>`
      )
      .join('');
    this.items.clear();
    for (const node of this.root.querySelectorAll('.stat')) {
      this.items.set(node.dataset.stat, {
        node,
        fill: node.querySelector('.fill'),
        value: node.querySelector('.stat-value'),
        delta: node.querySelector('.stat-delta'),
        current: 0,
        raf: 0,
      });
    }
  }

  set(stats, deltas = {}) {
    for (const [id, it] of this.items) {
      const v = Math.round(stats[id] ?? 0);
      it.fill.style.strokeDashoffset = String(100 - v);
      this.tween(it, v);
      const d = Math.round(deltas[id] ?? 0);
      if (d) {
        it.delta.textContent = `${d > 0 ? '+' : '−'}${Math.abs(d)}`;
        it.delta.className = `stat-delta hand ${d > 0 ? 'pos' : 'neg'}`;
        void it.delta.offsetWidth;
        it.delta.classList.add('show');
      }
    }
  }

  tween(it, to) {
    const from = it.current;
    it.current = to;
    cancelAnimationFrame(it.raf);
    const t0 = performance.now();
    const dur = 1200;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      it.value.textContent = String(Math.round(from + (to - from) * e));
      if (k < 1) it.raf = requestAnimationFrame(step);
    };
    it.raf = requestAnimationFrame(step);
  }

  show() {
    this.root.classList.add('is-visible');
  }

  hide() {
    this.root.classList.remove('is-visible');
  }
}
