// Persistencia local: la partida en curso y las preferencias de audio.
import { SAVE_VERSION } from '../engine/engine.js';

const GAME_KEY = 'brote:partida:v1';
const PREFS_KEY = 'brote:ajustes:v1';
const DEFAULT_PREFS = { music: true, volume: 0.5 };

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export const store = {
  load() {
    const s = read(GAME_KEY);
    return s && s.version === SAVE_VERSION && s.treeState ? s : null;
  },
  save(state) {
    write(GAME_KEY, state);
  },
  clear() {
    try {
      localStorage.removeItem(GAME_KEY);
    } catch {}
  },
  prefs() {
    return { ...DEFAULT_PREFS, ...(read(PREFS_KEY) ?? {}) };
  },
  savePrefs(prefs) {
    write(PREFS_KEY, prefs);
  },
};
