// Player preferences (sound, controls, graphics). Kept apart from the save slot so they belong to
// the device and survive New Game.
import { TOUCH_DEVICE } from './Device.js';

const KEY = 'celblade.prefs.v1';

export const DEFAULT_PREFS = {
  volume: 0.7,
  muted: false,
  firstPerson: false, // V toggles
  sensitivity: 1,     // × base mouse sensitivity
  invertY: false,
  fov: 55,            // field of view outside aim-down-sights
  shake: 1,           // camera shake scale
  motionFX: true,     // speed blur and lines
  shadows: true,
  outlines: true,
  hatching: true,
  fullscreen: true,   // fullscreen in play (lets Esc open and close menus without losing the mouse)
  graphics: 'medium', // quality: 'low' · 'medium' · 'high' (render/Quality.js)
  renderScale: 1,     // × the screen's resolution (capped at 2× CSS pixels)
  dynamicRes: true,   // lower the resolution while frames run slow, raise it again when they don't
  touchControls: 'auto', // 'auto' (phones and tablets) · 'on' · 'off'
  touchLook: 1,       // × base touch look speed
};

// Phones and tablets start lighter: no shadows, hatching or speed effects, and fewer pixels.
const TOUCH_DEFAULTS = { graphics: 'low', motionFX: false, shadows: false, hatching: false, renderScale: 0.75 };

export function defaultPrefs() {
  return { ...DEFAULT_PREFS, ...(TOUCH_DEVICE ? TOUCH_DEFAULTS : {}) };
}

// `legacy` carries sound settings older saves kept in their own settings block.
export function readPrefs(legacy = null) {
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { /* unreadable: defaults */ }
  const prefs = defaultPrefs();
  if (!stored && legacy) {
    if (typeof legacy.volume === 'number') prefs.volume = legacy.volume;
    if (typeof legacy.muted === 'boolean') prefs.muted = legacy.muted;
  }
  for (const [k, v] of Object.entries(stored ?? {})) if (k in prefs && typeof v === typeof prefs[k]) prefs[k] = v;
  return prefs;
}

export function writePrefs(prefs) {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* storage unavailable */ }
}
