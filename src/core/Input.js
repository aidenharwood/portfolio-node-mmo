// Keyboard + mouse state with per-frame edge detection ("pressed this frame").
// Keys typed into a text field (chat, sign-in) never reach the game.
// Touch controls (ui/TouchControls.js) drive the same state: their buttons hold and release key
// codes, the stick is an analog move direction, and dragging to look adds to the mouse deltas.
export const typing = (e) => {
  const t = e.target;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) && t.type !== 'range' && t.type !== 'checkbox';
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.locked = false;
    this.lockSupported = typeof canvas.requestPointerLock === 'function';
    // Touch play: no mouse to lock (see setTouch).
    this.touch = false;
    this.stick = null;     // { x, z, sprint }: the touch stick's direction, x right and z forward
    // Whether a click or key press may capture the mouse (only during play — never under a
    // dialogue or menu, where a stray click would steal the cursor).
    this.canLock = () => true;
    // Fullscreen with Esc kept by the page (set from the player's preference): see capture().
    this.fullscreen = false;

    window.addEventListener('keydown', (e) => {
      if (typing(e)) return;
      // Playing without the mouse (the browser wouldn't hand it back): any key takes it.
      if (!this.locked && this.lockSupported && e.code !== 'Escape' && this.canLock()) this.capture();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    // Thumb buttons (3/4) are dodge; stop the browser treating them as back/forward.
    const swallow = (e) => { if (e.button === 3 || e.button === 4) e.preventDefault(); };
    window.addEventListener('mouseup', swallow);
    canvas.addEventListener('mousedown', (e) => {
      swallow(e);
      // A click that takes the mouse back is only that: it doesn't also fire.
      if (!this.locked && this.lockSupported && this.canLock()) { this.capture(); return; }
      this.pressed.add('Mouse' + e.button);
      this.keys.add('Mouse' + e.button);
    });
    window.addEventListener('mouseup', (e) => this.keys.delete('Mouse' + e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
  }

  requestLock() {
    if (!this.lockSupported) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch { /* pointer lock unavailable; keyboard still works */ }
  }

  // Takes the mouse for play, and the screen too when `fullscreen` is on. Browsers only re-take
  // the mouse without a click when the page let go of it itself — Esc normally makes the browser
  // let go, so Esc couldn't close a menu straight back into play. Fullscreen lets the page keep
  // Esc (Keyboard Lock, Chromium), so the game always does the letting go. The mouse is asked for
  // first: going fullscreen uses up the click or key press that allows it.
  capture() {
    this.requestLock();
    if (this.fullscreen) this.enterFullscreen();
  }

  enterFullscreen() {
    const el = document.documentElement;
    if (document.fullscreenElement) { this.keepEscape(); return; }
    if (!el.requestFullscreen || navigator.userActivation?.isActive === false) return;
    el.requestFullscreen({ navigationUI: 'hide' }).then(() => {
      this.keepEscape();
      // Phones play sideways (where the browser lets a fullscreen page say so).
      if (this.touch) screen.orientation?.lock?.('landscape').catch(() => {});
    }, () => {});
  }

  keepEscape() {
    navigator.keyboard?.lock?.(['Escape']).catch(() => {});
  }

  exitFullscreen() {
    navigator.keyboard?.unlock?.();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  // Touch play needs no pointer lock: menus closing go straight back to play.
  setTouch(on) {
    this.touch = on;
    this.lockSupported = !on && typeof this.canvas.requestPointerLock === 'function';
    if (!on) this.stick = null;
  }

  // A virtual button: held from `hold` until `release`, "pressed" on the frame it went down.
  hold(code) {
    if (!this.keys.has(code)) this.pressed.add(code);
    this.keys.add(code);
  }

  release(code) { this.keys.delete(code); }

  // A drag across the screen, in the same units as mouse movement.
  look(dx, dy) {
    this.mouseDX += dx;
    this.mouseDY += dy;
  }

  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  wasPressed(...codes) { return codes.some((c) => this.pressed.has(c)); }

  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}
