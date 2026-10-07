import { esc } from './scenes.js';

// Un crédito puede ser texto o { "text": "...", "url": "https://..." } (con enlace).
const creditItem = (c) =>
  c && typeof c === 'object' && c.url
    ? `<li>${esc(c.text ?? c.url)} <a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.link ?? c.url.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a></li>`
    : `<li>${esc(typeof c === 'object' ? c?.text : c)}</li>`;

const paragraphs = (v) => (Array.isArray(v) ? v : v ? [v] : []).map((p) => `<p>${esc(p)}</p>`).join('');

export class Settings {
  constructor(root, toggle, opts) {
    this.root = root;
    this.toggle = toggle;
    this.opts = opts;
    this.isOpen = false;

    const meta = opts.meta ?? {};
    const credits = Array.isArray(meta.credits) ? meta.credits : meta.credits ? [meta.credits] : [];

    root.innerHTML = `
      <div class="settings-backdrop" data-close></div>
      <section class="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <svg class="panel-edge" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M2 3 C 30 1.4, 70 2.6, 98 2 C 98.7 30, 97.7 70, 98.3 97.6 C 70 98.7, 30 97.5, 1.8 98.2 C 1.2 70, 2.5 30, 2 3 Z"/>
        </svg>
        <header class="settings-head">
          <h2 id="settings-title" class="hand">Ajustes</h2>
          <button type="button" class="text-btn" data-close>cerrar</button>
        </header>
        <div class="setting-row">
          <span>Música</span>
          <button type="button" class="text-btn" data-music aria-pressed="false"></button>
        </div>
        <div class="setting-row">
          <label for="volume">Volumen</label>
          <input id="volume" type="range" min="0" max="1" step="0.01" data-volume>
        </div>
        <div class="setting-row" data-restart-row>
          <span>Partida</span>
          <span class="restart-ctl" data-restart-ctl></span>
        </div>
        <details>
          <summary class="hand">Acerca del proyecto</summary>
          <div class="details-body">${paragraphs(meta.about) || '<p>Sin descripción.</p>'}</div>
        </details>
        <details>
          <summary class="hand">Créditos</summary>
          <div class="details-body">${credits.length ? `<ul>${credits.map(creditItem).join('')}</ul>` : '<p>Sin créditos.</p>'}</div>
        </details>
      </section>`;

    this.musicBtn = root.querySelector('[data-music]');
    this.volume = root.querySelector('[data-volume]');
    this.restartCtl = root.querySelector('[data-restart-ctl]');
    this.restartRow = root.querySelector('[data-restart-row]');

    this.setMusic(opts.prefs.music);
    this.volume.value = String(opts.prefs.volume);

    root.querySelectorAll('[data-close]').forEach((n) => n.addEventListener('click', () => this.close()));
    this.musicBtn.addEventListener('click', () => {
      const on = this.musicBtn.getAttribute('aria-pressed') !== 'true';
      this.setMusic(on);
      opts.onMusic?.(on);
    });
    this.volume.addEventListener('input', () => opts.onVolume?.(Number(this.volume.value)));
    this.restartCtl.addEventListener('click', (e) => {
      const action = e.target.closest('button')?.dataset.r;
      if (action === 'ask') this.renderRestart(true);
      else if (action === 'no') this.renderRestart(false);
      else if (action === 'yes') {
        this.close();
        opts.onRestart?.();
      }
    });
    toggle.addEventListener('click', () => (this.isOpen ? this.close() : this.open()));
  }

  setMusic(on) {
    this.musicBtn.setAttribute('aria-pressed', String(on));
    this.musicBtn.textContent = on ? 'activada' : 'desactivada';
  }

  renderRestart(confirming) {
    this.restartCtl.innerHTML = confirming
      ? '<span class="confirm">¿Empezar de nuevo?</span> <button type="button" class="text-btn" data-r="yes">sí</button> <button type="button" class="text-btn" data-r="no">no</button>'
      : '<button type="button" class="text-btn" data-r="ask">Reiniciar</button>';
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.lastFocus = document.activeElement;
    this.restartRow.hidden = !this.opts.canRestart?.();
    this.renderRestart(false);
    this.root.hidden = false;
    document.getElementById('scene')?.setAttribute('inert', '');
    requestAnimationFrame(() => this.root.classList.add('is-open'));
    this.root.querySelector('.settings-head [data-close]')?.focus({ preventScroll: true });
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.remove('is-open');
    document.getElementById('scene')?.removeAttribute('inert');
    setTimeout(() => {
      if (!this.isOpen) this.root.hidden = true;
    }, 500);
    if (this.lastFocus?.isConnected) this.lastFocus.focus({ preventScroll: true });
  }
}
