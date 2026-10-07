// Árbol persistente: un solo SVG que nunca se desmonta.
// Toda la geometría y las animaciones son del TreeController de arbol/ (sin modificar);
// este archivo solo lo monta en la página y traduce el avance de la partida a "pasos" del árbol.

import { TreeController, mountArbol, TOTAL_STEPS } from './arbol.js';
import { hashString } from '../engine/rng.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const motion = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.3 : 1);
const toSeed = (key) => {
  const n = Number(key);
  return Number.isInteger(n) && n > 0 ? n : (hashString(String(key)) % 9999) + 1;
};

// Duración aproximada de crecer de un paso a otro (misma fórmula que TreeController.apply).
function growMs(from, to) {
  const levels = Math.abs(to - from);
  if (!levels) return 0;
  const gs = Math.max(0.45, Math.min(1, 9000 / (1800 + 1250 * levels)));
  let acc = 0;
  for (let d = Math.min(from, to); d < Math.max(from, to); d++) acc += (d === 0 ? 1800 : 1250) * gs;
  return acc + 400;
}

export class PersistentTree {
  constructor(host) {
    this.host = host;
    host.dataset.pos = 'center';
    this.controller = new TreeController({ seed: 1 + Math.floor(Math.random() * 9999) });
    this.unmount = mountArbol(host, this.controller);
  }

  /** Semilla actual (la partida la usa como propia para poder reconstruir el mismo árbol). */
  get seedKey() {
    return String(this.controller.getState().seed);
  }

  get step() {
    return this.controller.getState().step;
  }

  /** Mueve el árbol dentro de la pantalla: center → right → left. */
  setPosition(pos) {
    this.host.dataset.pos = pos;
  }

  hasGrowth() {
    const s = this.controller.getState();
    return s.step > 0 || s.dry;
  }

  /** El brote se dibuja solo al montar el controlador. */
  introduce() {}

  /** Reparte el progreso de la partida (0..1) en los 15 pasos del árbol. */
  stepFor(fraction, done = 0) {
    return Math.min(TOTAL_STEPS, Math.max(done > 0 ? 1 : 0, Math.round(fraction * TOTAL_STEPS)));
  }

  /** Crece hasta el paso que corresponde (nunca retrocede). Devuelve la duración en ms. */
  advance(fraction, done) {
    const s = this.controller.getState();
    const want = Math.max(s.step, this.stepFor(fraction, done));
    if (want === s.step) return 0;
    this.controller.goStep(want);
    return growMs(s.step, want);
  }

  /** Reanuda una partida guardada: mismo árbol (misma semilla) y vuelve a crecer hasta su paso. */
  async rebuild(seedKey, step) {
    const seed = toSeed(seedKey);
    this.host.classList.add('is-swapping');
    await wait(500 * motion());
    if (this.controller.getState().seed !== seed) this.controller.setSeed(seed);
    this.controller.goStep(step);
    this.host.classList.remove('is-swapping');
    return growMs(0, step) + 2000;
  }

  /**
   * Final en tres tiempos, para que nunca coincidan los dos trabajos más pesados del SVG
   * (mover la cámara y animar cientos de hojas a la vez):
   *   1) termina de crecer lo que falte,
   *   2) la cámara se aleja hasta mostrar el árbol entero (con sus hojas),
   *   3) las hojas caen y la madera se seca.
   */
  async wither() {
    const m = motion();
    const s = this.controller.getState();
    if (s.step < TOTAL_STEPS) {
      this.controller.goStep(TOTAL_STEPS);
      await wait((growMs(s.step, TOTAL_STEPS) + 400) * m);
    }
    this.controller.setCameraMode('full');
    await wait(3500 * m);
    this.controller.dry();
    await wait(5600 * m);
  }

  /** Reinicio: las ramas se retraen hasta el brote y sale una semilla nueva. */
  async retract() {
    const levels = Math.max(1, this.controller.getState().step);
    const ret = Math.max(250, Math.min(650, 4500 / levels));
    this.controller.reset();
    await wait(Math.max(levels * ret + 600, 3300) * motion());
    this.controller.setSeed();
    await wait(400);
  }
}
