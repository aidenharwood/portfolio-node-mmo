// Touch controls for phones and tablets: a floating stick on the left half of the screen, drag
// anywhere on the right to look, and a cluster of action buttons under the right thumb. They drive
// the same input state as the keyboard and mouse (core/Input.js), so the game itself doesn't know
// the difference.
//   Stick — put a thumb down anywhere on the left; the knob stays under it (the stick follows a
//   thumb that goes past the ring). Held right out for a moment, it sprints.
//   Fire / attack and Aim / heavy — while held, drag the same thumb to aim.
//   Left-hand Fire (held) and Aim (on until tapped again): shoot with the left thumb while the
//   right one aims.
//   Jump (hold for height), Dodge, Slide (on until tapped again or the stick is let go: slide,
//   then jump for a bullet jump), Reload, quick melee.
//   The HUD's own prompts are buttons too: the interaction prompt (E), the loot card (tap to pick
//   up, hold to swap) and the weapon slots (switch weapon).
const STICK_R = 52;        // px: full deflection
const DEAD = 0.12;         // stick dead zone (fraction of full deflection)
const SPRINT_PUSH = 0.9;   // deflection that counts as "right out"...
const SPRINT_AFTER = 350;  // ...held this long (ms) to sprint, until it drops under SPRINT_KEEP
const SPRINT_KEEP = 0.75;
const LOOK = 2.4;          // touch pixels → mouse units (CameraRig turns 0.0025 rad per unit)
const STICK_ZONE = 0.42;   // the left part of the screen where a touch becomes the stick

const LABELS = {
  ranged: { Mouse0: 'Fire', Mouse2: 'Aim' },
  magic: { Mouse0: 'Cast', Mouse2: 'Aim' },
  melee: { Mouse0: 'Attack', Mouse2: 'Heavy' },
};

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.enabled = false;
    this.shown = false;
    this.pointers = new Map();   // pointerId → { kind: 'stick' | 'look' | 'key', … }
    this.holds = new Map();      // key code → how many fingers and toggles hold it
    this.toggled = new Set();    // key codes switched on by a toggle button
    this.weaponClass = null;
    this.push = 0;               // the stick's deflection, 0..1
    this.pushedAt = 0;           // when it last went right out (0: it isn't)

    const el = document.createElement('div');
    el.id = 'touch';
    el.className = 'hidden';
    el.innerHTML = `
      <div class="tc-stick hidden"><i class="tc-ring"></i><i class="tc-knob"></i></div>
      <div class="tc-top">
        <button class="tc-btn tc-util" data-act="menu" aria-label="Menu"><i class="tc-burger"></i></button>
        <button class="tc-btn tc-util" data-act="chat">Chat</button>
        <button class="tc-btn tc-util" data-act="view">View</button>
      </div>
      <div class="tc-left">
        <button class="tc-btn tc-lfire" data-code="Mouse0">Fire</button>
        <button class="tc-btn tc-laim tc-sm" data-toggle="Mouse2">Aim</button>
      </div>
      <div class="tc-cluster">
        <button class="tc-btn tc-fire" data-code="Mouse0" data-look>Fire</button>
        <button class="tc-btn tc-aim" data-code="Mouse2" data-look>Aim</button>
        <button class="tc-btn tc-jump" data-code="Space">Jump</button>
        <button class="tc-btn tc-dodge" data-code="Mouse3">Dash</button>
        <button class="tc-btn tc-slide tc-sm" data-toggle="KeyC">Slide</button>
        <button class="tc-btn tc-reload tc-sm" data-code="KeyR">Reload</button>
        <button class="tc-btn tc-melee tc-sm" data-code="KeyQ">Melee</button>
      </div>`;
    // Under the HUD (whose prompts take touches of their own), over the game view.
    document.getElementById('hud').before(el);
    this.el = el;
    this.stickEl = el.querySelector('.tc-stick');
    this.knob = el.querySelector('.tc-knob');

    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e));
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    // The HUD's prompts as buttons.
    const hud = (id, code) => {
      const t = document.getElementById(id);
      t.addEventListener('pointerdown', (e) => {
        if (!this.shown) return;
        const slot = code === 'Digit' ? e.target.closest('.slot') : null;
        const key = slot ? `Digit${[...slot.parentNode.children].indexOf(slot) + 1}` : code;
        if (key === 'Digit') return;
        e.preventDefault();
        try { t.setPointerCapture(e.pointerId); } catch { /* not an active pointer */ }
        this.press(key);
        this.pointers.set(e.pointerId, { kind: 'key', code: key, el: null });
      });
      t.addEventListener('pointerup', (e) => this.up(e));
      t.addEventListener('pointercancel', (e) => this.up(e));
    };
    hud('prompt', 'KeyE');
    hud('loot-card', 'KeyF');
    hud('slots', 'Digit');
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.show(false);
  }

  // A key held by any finger or toggle stays down until the last of them lets go.
  press(code) {
    const n = this.holds.get(code) ?? 0;
    this.holds.set(code, n + 1);
    if (!n) this.input.hold(code);
  }

  unpress(code) {
    const n = (this.holds.get(code) ?? 0) - 1;
    if (n > 0) { this.holds.set(code, n); return; }
    this.holds.delete(code);
    this.input.release(code);
  }

  toggle(code, on = !this.toggled.has(code)) {
    if (on === this.toggled.has(code)) return;
    if (on) { this.toggled.add(code); this.press(code); } else { this.toggled.delete(code); this.unpress(code); }
    for (const b of this.el.querySelectorAll(`[data-toggle="${code}"]`)) b.classList.toggle('on', on);
  }

  // Each frame: shown only in play (menus, the title and dialogues have their own buttons).
  update() {
    const show = this.enabled && this.game.state === 'playing';
    if (show !== this.shown) this.show(show);
    if (!show) return;
    const cls = this.game.player.weaponClass ?? 'melee';
    if (cls !== this.weaponClass) {
      this.weaponClass = cls;
      for (const [code, label] of Object.entries(LABELS[cls] ?? LABELS.melee)) {
        for (const b of this.el.querySelectorAll(`[data-code="${code}"]`)) b.textContent = label;
      }
      this.el.classList.toggle('tc-melee-weapon', cls === 'melee');
      if (cls === 'melee') this.toggle('Mouse2', false); // a held heavy attack isn't a thing
    }
    this.el.querySelector('[data-act="chat"]').classList.toggle('hidden', !this.game.net.inWorld);
    // Sprinting: the stick held right out for a moment, until it eases off.
    const stick = this.input.stick;
    if (stick) {
      const was = stick.sprint;
      stick.sprint = this.pushedAt ? performance.now() - this.pushedAt >= SPRINT_AFTER : (was && this.push >= SPRINT_KEEP);
      this.stickEl.classList.toggle('sprint', stick.sprint);
    }
  }

  show(on) {
    this.shown = on;
    this.el.classList.toggle('hidden', !on);
    if (!on) this.releaseAll();
  }

  // Everything let go (a menu opened over a held button must not leave it held).
  releaseAll() {
    for (const code of [...this.toggled]) this.toggle(code, false);
    for (const p of this.pointers.values()) p.el?.classList.remove('on');
    for (const code of this.holds.keys()) this.input.release(code);
    this.holds.clear();
    this.pointers.clear();
    this.input.stick = null;
    this.push = 0;
    this.pushedAt = 0;
    this.stickEl.classList.add('hidden');
  }

  down(e) {
    e.preventDefault(); // no emulated mouse clicks, scrolling or zooming
    try { this.el.setPointerCapture(e.pointerId); } catch { /* not an active pointer */ }
    const btn = e.target.closest('[data-code], [data-act], [data-toggle]');
    if (btn?.dataset.act) { this.act(btn.dataset.act); return; }
    if (btn?.dataset.toggle) { this.toggle(btn.dataset.toggle); return; }
    if (btn) {
      this.press(btn.dataset.code);
      btn.classList.add('on');
      this.pointers.set(e.pointerId, { kind: 'key', code: btn.dataset.code, el: btn, look: 'look' in btn.dataset, x: e.clientX, y: e.clientY });
      return;
    }
    if (e.clientX < window.innerWidth * STICK_ZONE && ![...this.pointers.values()].some((p) => p.kind === 'stick')) {
      this.pointers.set(e.pointerId, { kind: 'stick', ox: e.clientX, oy: e.clientY });
      this.stickEl.classList.remove('hidden');
      this.stickEl.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      this.knob.style.transform = '';
      this.input.stick = { x: 0, z: 0, sprint: false };
      return;
    }
    this.pointers.set(e.pointerId, { kind: 'look', x: e.clientX, y: e.clientY });
  }

  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    if (p.kind === 'stick') {
      let dx = e.clientX - p.ox;
      let dy = e.clientY - p.oy;
      const d = Math.hypot(dx, dy);
      // The knob stays under the thumb: past the ring, the whole stick comes along.
      if (d > STICK_R) {
        p.ox += (dx / d) * (d - STICK_R);
        p.oy += (dy / d) * (d - STICK_R);
        dx = e.clientX - p.ox;
        dy = e.clientY - p.oy;
        this.stickEl.style.transform = `translate(${p.ox}px, ${p.oy}px)`;
      }
      const push = Math.min(1, Math.hypot(dx, dy) / STICK_R);
      const k = push < DEAD ? 0 : push / Math.max(Math.hypot(dx, dy), 1e-6);
      this.push = push;
      if (push >= SPRINT_PUSH) this.pushedAt ||= performance.now();
      else this.pushedAt = 0;
      const stick = this.input.stick ?? (this.input.stick = { x: 0, z: 0, sprint: false });
      stick.x = dx * k;
      stick.z = -dy * k;
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      return;
    }
    if (p.kind === 'look' || p.look) {
      const s = LOOK * (this.game.prefs.touchLook ?? 1);
      this.input.look((e.clientX - p.x) * s, (e.clientY - p.y) * s);
      p.x = e.clientX;
      p.y = e.clientY;
    }
  }

  up(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (p.kind === 'key') {
      this.unpress(p.code);
      p.el?.classList.remove('on');
    } else if (p.kind === 'stick') {
      this.input.stick = null;
      this.push = 0;
      this.pushedAt = 0;
      this.stickEl.classList.add('hidden');
      this.stickEl.classList.remove('sprint');
      this.toggle('KeyC', false); // letting go of the stick ends a slide
    }
  }

  act(what) {
    const g = this.game;
    if (what === 'menu') g.onEscape();
    else if (what === 'chat') g.chat.open('');
    else if (what === 'view') {
      g.setPref('firstPerson', !g.prefs.firstPerson);
      g.hud.toast(g.prefs.firstPerson ? 'First person' : 'Third person');
    }
  }
}
