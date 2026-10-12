// How the game changes its character: every change is an operation on the shared rules
// (rpg/CharacterCore.js).
//   Offline, the game is the authority: it rolls any dice itself and applies the operation.
//   Online, the server is: predicted operations (moving gear, selling, spending points...) apply
//   here at once and go to the server to be checked; rolled ones (loot, chests, quest rewards,
//   quest offers, travel) go to the server and apply when it answers with the roll.
// The server's answers carry a fingerprint of its copy; when nothing of ours is in flight and the
// fingerprints differ, we ask for the whole character again (and the server's copy wins).
import { PREDICTED, ROLLED } from '../rpg/CharacterCore.js';

const RESYNC_GAP = 3000;

export class CharacterLink {
  constructor(game) {
    this.game = game;
    this.core = null;
    this.seq = 0;
    this.waiting = new Map(); // seq → { op, resolve } for rolled operations
    this.lastResync = 0;
    this.lastSent = 0;
  }

  attach(core) {
    this.core = core;
    this.waiting.clear();
  }

  get online() { return this.game.net.inWorld; }

  // Returns true/false at once for operations decided here; a promise (of true/false) for those
  // the server has to roll.
  do(op) {
    const core = this.core;
    const g = this.game;
    if (!core) return false;
    if (!this.online) {
      if (ROLLED.has(op.op)) op.roll = core.roll(op);
      const r = core.apply(op);
      g.onCharFx(r.fx, op);
      if (r.ok) g.save();
      return r.ok;
    }
    const seq = ++this.seq;
    if (PREDICTED.has(op.op)) {
      const r = core.apply(op);
      if (!r.ok) return false;
      g.onCharFx(r.fx, op);
      g.net.send({ t: 'op', seq, op });
      this.lastSent = performance.now();
      return true;
    }
    g.net.send({ t: 'op', seq, op });
    this.lastSent = performance.now();
    return new Promise((resolve) => this.waiting.set(seq, { op, resolve }));
  }

  // The server's answer: { seq, ok, roll?, h }.
  onAck(m) {
    const w = this.waiting.get(m.seq);
    if (w) {
      this.waiting.delete(m.seq);
      let ok = false;
      if (m.ok) {
        w.op.roll = m.roll;
        const r = this.core.apply(w.op);
        this.game.onCharFx(r.fx, w.op);
        ok = r.ok;
      }
      w.resolve(ok);
    } else if (!m.ok) {
      // A change we'd already shown was refused: take the server's copy.
      this.resync(true);
      return;
    }
    if (m.h && m.seq === this.seq && !this.waiting.size && m.h !== this.core.hash()) this.resync();
  }

  // A change the server made (a kill's rewards, a camp cleared...).
  onServerOp(op) {
    const r = this.core.apply(op);
    this.game.onCharFx(r.fx, op);
  }

  // The server's periodic fingerprint.
  onCheck(h) {
    // (Not while a change of ours may still be on its way.)
    if (!this.waiting.size && performance.now() - this.lastSent > 1500 && h !== this.core.hash()) this.resync();
  }

  resync(force = false) {
    const now = performance.now();
    if (!force && now - this.lastResync < RESYNC_GAP) return;
    this.lastResync = now;
    this.game.net.send({ t: 'resync' });
  }
}
