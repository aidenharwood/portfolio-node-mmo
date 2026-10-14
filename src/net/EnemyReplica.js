// An enemy the server simulates, as this screen follows it: its definition rebuilt from its type
// (the same functions the sim uses), and its state played back between the snapshots either side
// of the render time — a little in the past, like other players — so motion stays smooth through
// network jitter. It offers the fields of an EnemySim, so one view (entities/Enemy.js) draws both.
import * as THREE from 'three';
import { enemyType, enemyAttacks, enemyRadius, enemyMaxHp, STATES, FLAG } from '../sim/enemyDefs.js';
import { SHIELD } from '../sim/affixes.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerp = (a, b, t) => a + (b - a) * t;
const WARD = { reduce: 0.5 };
const CHILL = { slow: 0.45 };
const CORRODE = { amp: 0.25 };
const MARK = {};

export class EnemyReplica {
  constructor(info, ts) {
    this.id = info.id;
    this.typeName = info.t;
    this.variant = info.v ?? null;
    this.level = info.lv;
    this.elite = info.el ?? null;
    this.summoner = info.su || null;
    this.type = enemyType(info.t, info.v, info.el, !!info.su, !!info.ch);
    this.champion = !!info.ch;
    this.horde = !!info.hd;
    this.affixes = info.af ?? [];
    this.shieldMax = this.affixes.includes('shielded') ? Math.round(enemyMaxHp(this.type, info.lv) * SHIELD.share) : 0;
    this.shield = this.shieldMax;
    this.displayName = info.nm ?? (info.el ? `${info.el}` : this.type.name);
    this.attacks = enemyAttacks(this.type, info.lv);
    this.radius = enemyRadius(this.type);
    this.height = this.type.height;
    this.mass = this.type.mass;
    this.hover = this.type.hover ?? 0;
    this.maxHp = info.mh;
    this.hp = info.hp;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.knockback = new THREE.Vector3();
    this.facing = 0;
    this.statuses = {};
    this.buffer = [];
    this.push(ts, info.s);
    this.apply(info.s, 0);
    this.position.set(info.s[1], info.s[2], info.s[3]);
    this.facing = info.s[4];
  }

  push(ts, s) {
    const buf = this.buffer;
    if (buf.length && ts <= buf[buf.length - 1].t) return;
    buf.push({ t: ts, s });
    if (buf.length > 30) buf.shift();
  }

  // Plays the buffer back at server time `T` (ms).
  update(T) {
    const buf = this.buffer;
    let i = buf.length - 1;
    while (i > 0 && buf[i].t > T) i--;
    if (i > 1) buf.splice(0, i - 1);
    i = Math.min(i, 1);
    const a = buf[i];
    const b = buf[i + 1] ?? null;
    const sa = a.s;
    if (b && a.t <= T) {
      const k = Math.min(1, (T - a.t) / Math.max(1, b.t - a.t));
      const sb = b.s;
      // A jump (blink, a stuck enemy walked home) snaps rather than gliding across the map.
      if (Math.hypot(sb[1] - sa[1], sb[3] - sa[3]) > 6) this.position.set(sb[1], sb[2], sb[3]);
      else this.position.set(lerp(sa[1], sb[1], k), lerp(sa[2], sb[2], k), lerp(sa[3], sb[3], k));
      this.facing = sa[4] + wrap(sb[4] - sa[4]) * k;
      this.velocity.set(lerp(sa[5], sb[5], k), 0, lerp(sa[6], sb[6], k));
    } else {
      this.position.set(sa[1], sa[2], sa[3]);
      this.facing = sa[4];
      this.velocity.set(sa[5], 0, sa[6]);
    }
    this.apply(sa, Math.max(0, (T - a.t) / 1000));
  }

  apply(s, since) {
    this.state = STATES[s[7]] ?? 'idle';
    this.stateTime = s[8] + since;
    this.curIndex = s[9];
    this.cur = this.attacks[s[9]] ?? null;
    this.hitIndex = s[10];
    this.hp = s[11];
    const fl = s[12];
    this.lift = s[13];
    this.alt = s[14];
    this.foe = s[15] >= 0 ? s[15] : null;
    this.attackSeq = s[16];
    this.maxHp = s[17] ?? this.maxHp;
    // A shield comes with the state while there is one (an affix's, or a raid boss's own).
    if (s[18] !== undefined) { this.shield = s[18]; this.shieldMax = Math.max(this.shieldMax, s[18]); }
    else if (this.shieldMax) this.shield = 0;
    this.immune = !!(fl & FLAG.immune);
    this.rallied = !!(fl & FLAG.rallied);
    this.alive = !!(fl & FLAG.alive);
    this.engaged = !!(fl & FLAG.engaged);
    this.hidden = !!(fl & FLAG.hidden);
    this.guarding = !!(fl & FLAG.guarding);
    this.ward = fl & FLAG.ward ? WARD : null;
    this.frenzy = fl & FLAG.frenzy ? 1 : 0;
    const st = this.statuses;
    for (const k of Object.keys(st)) delete st[k];
    if (fl & FLAG.burn) st.burn = MARK;
    if (fl & FLAG.chill) st.chill = CHILL;
    if (fl & FLAG.corrode) st.corrode = CORRODE;
    if (fl & FLAG.shocked) st.shocked = MARK;
  }
}
