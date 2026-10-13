// Health cells: small heals the dead leave behind, on each player's own screen (a player's health
// is their own screen's business — docs/MULTIPLAYER.md — so each rolls their own). Some trash
// drops one; elites and bosses always leave a few, bigger. They wait for you while they last, and
// drift to you once you're close and hurt.
import * as THREE from 'three';

const GEO = new THREE.IcosahedronGeometry(1, 1);
const CORE = new THREE.MeshBasicMaterial({ color: 0xb8ffd0 });
const SHELL = new THREE.MeshBasicMaterial({ color: 0x3dff7a, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
const LIFE = 25;       // seconds a cell lasts
const PULL = 3.2;      // metres: a hurt player draws cells in from this far...
const TAKE = 0.9;      // ...and takes them from this close
const _v = new THREE.Vector3();

export class Pickups {
  constructor(game) {
    this.game = game;
    this.cells = [];
  }

  // An enemy died here: maybe some cells (none from summoned minions).
  onKill(e) {
    if (!e || e.summoned) return;
    const big = e.isBoss || e.elite;
    const n = e.isBoss ? 4 : e.elite ? 2 : Math.random() < 0.2 ? 1 : 0;
    for (let i = 0; i < n; i++) this.drop(e.position, big ? 0.25 : 0.1, i, n);
  }

  // `heal`: the share of max health it gives.
  drop(at, heal, i = 0, n = 1) {
    const g = this.game;
    const root = new THREE.Group();
    const size = heal >= 0.2 ? 0.3 : 0.22;
    const core = new THREE.Mesh(GEO, CORE);
    core.scale.setScalar(size * 0.55);
    const shell = new THREE.Mesh(GEO, SHELL);
    shell.scale.setScalar(size);
    root.add(core, shell);
    const a = (i / Math.max(1, n)) * Math.PI * 2 + Math.random();
    const r = n > 1 ? 0.8 + Math.random() * 0.6 : 0.3;
    root.position.set(at.x + Math.cos(a) * r, 0, at.z + Math.sin(a) * r);
    root.position.y = g.world.supportHeight(root.position.x, root.position.z, at.y + 1.5) + 0.55;
    g.scene.add(root);
    this.cells.push({ root, shell, heal, t: 0, base: root.position.y, phase: Math.random() * 6 });
  }

  update(dt) {
    const p = this.game.player;
    const hurt = p.alive && p.hp < p.maxHp;
    for (let i = this.cells.length - 1; i >= 0; i--) {
      const c = this.cells[i];
      c.t += dt;
      const pos = c.root.position;
      _v.set(p.position.x - pos.x, p.position.y + 1 - pos.y, p.position.z - pos.z);
      const d = _v.length();
      if (hurt && d < TAKE) {
        this.take(c, i);
        continue;
      }
      if (hurt && d < PULL) pos.addScaledVector(_v, Math.min(1, dt * (10 / Math.max(d, 0.3))));
      else pos.y = c.base + Math.sin(c.t * 2.4 + c.phase) * 0.08;
      c.root.rotation.y += dt * 1.5;
      // Fading out over its last few seconds.
      const k = Math.max(0, Math.min(1, (LIFE - c.t) / 3));
      c.shell.scale.setScalar((c.heal >= 0.2 ? 0.3 : 0.22) * (0.9 + 0.12 * Math.sin(c.t * 5 + c.phase)) * k);
      if (c.t >= LIFE) this.remove(i);
    }
  }

  take(c, i) {
    const g = this.game;
    const p = g.player;
    const amount = Math.round(p.maxHp * c.heal);
    p.heal(amount);
    _v.copy(p.position).setY(p.position.y + 2.1);
    g.effects.damageNumber(_v, `+${amount}`, 'xp', '#5dff8a');
    g.effects.glow(c.root.position, 0x3dff7a, { size: 0.9, grow: 1.5, life: 0.3 });
    g.audio.cell?.(c.root.position);
    this.remove(i);
  }

  remove(i) {
    this.game.scene.remove(this.cells[i].root);
    this.cells.splice(i, 1);
  }

  clear() {
    for (const c of this.cells) this.game.scene.remove(c.root);
    this.cells.length = 0;
  }
}
