// First-person scope view, in the style of the gun maker's scope (items/WeaponModel.js scopeModel):
//   military   military glass: mil-dot crosshair with heavy outer posts, holdover ticks, a green
//              centre dot and a rangefinder readout
//   junk       scav glass: a hand-scratched crosshair and ring, a cracked lens, riveted bezel
//   digital    digital: a glowing chevron, segmented range ring, live distance readout, scanlines
//   crystal    crystal: a diamond reticle with frost-forked lines and a frosted, faceted rim
// Tinted by the weapon's signature colour.
import { MANUFACTURERS } from '../items/manufacturers.js';
import { ELEMENTS } from '../items/elements.js';
import { scopeStyle } from '../items/WeaponModel.js';

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const rgba = (n, a) => `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
const range = (a, b, step) => { const out = []; for (let v = a; v <= b; v += step) out.push(v); return out; };

const RETICLE = {
  military: (glow) => `
    <path d="M-100 0H-7 M7 0H100 M0 -100V-7 M0 7V100" stroke-width="0.55"/>
    <path d="M-100 0H-60 M60 0H100 M0 60V100 M0 -100V-60" stroke-width="2.6"/>
    ${range(-5, 5, 1).filter((i) => i).map((i) => `<circle cx="${i * 10}" cy="0" r="0.95" fill="currentColor" stroke="none"/><circle cx="0" cy="${i * 10}" r="0.95" fill="currentColor" stroke="none"/>`).join('')}
    <path d="M-3 16H3 M-2.5 24H2.5 M-2 32H2" stroke-width="0.6"/>
    <circle r="0.8" fill="${glow}" stroke="none"/>`,
  junk: () => `
    <path d="M-100 1 C-62 -2 -32 3 -9 0 M9 0 C32 -3 62 2 100 -1 M0 -100 C2 -62 -3 -32 0 -9 M0 9 C-2 40 3 70 -1 100" stroke-width="1.9"/>
    <path d="M1 -24 C16 -26 27 -13 25 2 C24 17 11 27 -3 25 C-18 23 -27 11 -25 -4 C-23 -17 -12 -25 4 -23" stroke-width="1.1"/>
    <path d="M-2.5 -2.5L2.5 2.5M2.5 -2.5L-2.5 2.5" stroke-width="0.9"/>
    <path class="crack" d="M62 -78 L49 -53 L57 -41 L39 -19 M49 -53 L31 -50 M57 -41 L71 -30" stroke-width="0.5"/>
    ${range(0, 7, 1).map((i) => { const a = (i / 8) * Math.PI * 2 + 0.3; return `<circle class="rivet" cx="${(Math.cos(a) * 96).toFixed(1)}" cy="${(Math.sin(a) * 96).toFixed(1)}" r="2"/>`; }).join('')}`,
  digital: () => `
    <path d="M-7 8 L0 0 L7 8" stroke-width="1.3"/>
    <circle r="30" stroke-dasharray="7 4" stroke-width="0.8"/>
    <circle r="58" stroke-width="0.35" opacity="0.6"/>
    <path d="M-48 0H-36 M36 0H48 M0 -48V-36 M0 36V48" stroke-width="1.2"/>
    <path d="M-70 -50V-56H-62 M70 -50V-56H62 M-70 50V56H-62 M70 50V56H62" stroke-width="0.8"/>`,
  crystal: () => `
    <path d="M0 -5 L5 0 L0 5 L-5 0Z" stroke-width="0.9"/>
    <circle r="0.8" fill="currentColor" stroke="none"/>
    <path d="M0 -5V-72 M0 5V72 M-5 0H-72 M5 0H72" stroke-width="0.5"/>
    ${[40, 62].map((d) => `<path d="M0 -${d} L-5 -${d + 6} M0 -${d} L5 -${d + 6} M0 ${d} L-5 ${d + 6} M0 ${d} L5 ${d + 6} M-${d} 0 L-${d + 6} -5 M-${d} 0 L-${d + 6} 5 M${d} 0 L${d + 6} -5 M${d} 0 L${d + 6} 5" stroke-width="0.5"/>`).join('')}
    <polygon points="${range(0, 7, 1).map((i) => { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; return `${(Math.cos(a) * 92).toFixed(1)},${(Math.sin(a) * 92).toFixed(1)}`; }).join(' ')}" stroke-width="0.5" opacity="0.35"/>`,
  default: () => `
    <path d="M-100 0H-6 M6 0H100 M0 -100V-6 M0 6V100" stroke-width="0.7"/>
    <circle r="0.9" fill="currentColor" stroke="none"/>`,
};

export class ScopeView {
  constructor(el) {
    this.el = el;
    this.key = null;
    this.readout = null;
    this.lastRange = -1;
  }

  show(weapon) {
    const key = weapon.uid;
    if (key !== this.key) this.build(weapon);
    this.el.classList.remove('hidden');
  }

  hide() {
    this.el.classList.add('hidden');
  }

  build(weapon) {
    this.key = weapon.uid;
    const style = scopeStyle(weapon);
    const pal = MANUFACTURERS[weapon.manufacturer]?.palette ?? {};
    const glow = weapon.element !== 'none' ? ELEMENTS[weapon.element].color : pal.energy ?? 0x7fd4ff;
    const look = {
      military: { ret: 0x0b0f0a, ring: 0x2a3038, tint: glow },
      junk: { ret: 0x1a1006, ring: 0xb08a3e, tint: 0xd8c070 },
      digital: { ret: glow, ring: pal.primary ?? 0xe8e8f0, tint: glow },
      crystal: { ret: 0x2a6a8a, ring: pal.secondary ?? 0x355c7d, tint: 0xbff4ff },
      default: { ret: 0x0a0810, ring: 0x14101c, tint: glow },
    }[style];
    this.el.className = `scope-${style}`;
    this.el.style.setProperty('--ret', hex(look.ret));
    this.el.style.setProperty('--ring', hex(look.ring));
    this.el.style.setProperty('--tint', rgba(look.tint, 0.1));
    this.el.style.setProperty('--glow', hex(glow));
    const readout = style === 'military' || style === 'digital';
    this.el.innerHTML = `
      <div class="scope-lens"></div>
      <svg class="scope-ret" viewBox="-100 -100 200 200" fill="none" stroke="currentColor">${RETICLE[style](hex(glow))}</svg>
      ${readout ? '<div class="scope-read"></div>' : ''}`;
    this.readout = this.el.querySelector('.scope-read');
    this.lastRange = -1;
  }

  // Distance to whatever the scope is on (rangefinders and digital scopes show it).
  setRange(m) {
    if (!this.readout) return;
    const r = Math.round(m);
    if (r === this.lastRange) return;
    this.lastRange = r;
    this.readout.textContent = r >= 150 ? '---- m' : `${r} m`;
  }
}
