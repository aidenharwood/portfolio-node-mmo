// Procedural audio engine. No samples: every sound is synthesised at play time from noise and
// oscillators, so each shot, step and swing comes out slightly different.
//   mix      voices → (distance lowpass → stereo pan) → dry bus + outdoor reverb send → master →
//            compressor → speakers. The reverb is a generated impulse: a short air tail plus a
//            couple of late valley echoes, which is what makes gunfire sound outdoors.
//   space    voices placed in the world are attenuated, filtered and panned relative to the
//            camera once when they start (sounds are short; the listener barely moves meanwhile).
//   building noise bursts and swept tones with envelopes, metallic rings, FM pings and a soft
//            clipper; recipes in audio/Sfx.js layer these into finished sounds.
import * as THREE from 'three';

const MAX_VOICES = 56;
const _d = new THREE.Vector3();

export class Engine {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.muted = false;
    this.active = 0;
    this.throttle = new Map();
    this.listener = { pos: new THREE.Vector3(), right: new THREE.Vector3(1, 0, 0) };
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    // A hidden tab stops the game loop; silence the context so loops don't hang on.
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx || this.offline) return;
      if (document.hidden) this.ctx.suspend();
      else this.ctx.resume();
    });
  }

  get ready() { return !!this.ctx && (this.offline || this.ctx.state === 'running'); }
  get now() { return this.ctx.currentTime; }

  // Browsers only start audio after a user gesture; the first click or key press builds the graph.
  unlock() {
    if (!this.ctx) this.attach(new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' }));
    if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume();
  }

  // Builds the mix graph on `ctx` (an OfflineAudioContext works too, for rendering tests).
  attach(ctx) {
    this.ctx = ctx;
    this.offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.002;
    comp.release.value = 0.2;
    this.master.connect(comp).connect(ctx.destination);
    this.dry = ctx.createGain();
    this.dry.connect(this.master);
    this.verbIn = ctx.createGain();
    const verb = ctx.createConvolver();
    verb.buffer = this.impulse(2.4);
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.55;
    this.verbIn.connect(verb).connect(verbOut).connect(this.master);
    this.noise = { white: this.noiseBuffer('white'), pink: this.noiseBuffer('pink'), brown: this.noiseBuffer('brown') };
    this.clip = ctx.createWaveShaper ? softClipCurve() : null;
    this.active = 0;
  }

  setVolume(v, muted = this.muted) {
    this.volume = v;
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : v, this.ctx.currentTime, 0.03);
  }

  // Listener = the camera. Call once a frame.
  setListener(camera) {
    camera.getWorldPosition(this.listener.pos);
    this.listener.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
  }

  // At most one sound per `key` every `gap` seconds (casings, impacts, distant footsteps).
  allow(key, gap) {
    if (!this.ctx) return false;
    const t = this.ctx.currentTime;
    if (t - (this.throttle.get(key) ?? -1) < gap) return false;
    this.throttle.set(key, t);
    return true;
  }

  /**
   * Opens a voice and returns { in, t } — connect sources to `in` and start them at `t` — or null
   * if the sound can't be heard (too far, too many voices, audio not started).
   * pos: world position (null = at the listener); gain; wet: reverb send; dur: seconds the voice
   * lives; reach: distance (m) at which it has fallen to ~40%; priority 0..2 (2 never dropped).
   */
  voice({ pos = null, gain = 1, wet = 0.15, dur = 1, reach = 12, priority = 1, pan = 0, delay = 0 } = {}) {
    if (!this.ready || this.muted) return null;
    if (this.active >= MAX_VOICES && priority < 2) return null;
    if (this.active >= MAX_VOICES * 0.7 && priority < 1) return null;
    const ctx = this.ctx;
    let level = gain;
    let cutoff = 20000;
    let send = wet;
    if (pos) {
      _d.subVectors(pos, this.listener.pos);
      const dist = _d.length();
      const k = dist / reach;
      level *= 1 / (1 + k * k * 1.5);
      if (level < 0.004) return null;
      cutoff = 20000 / (1 + dist * 0.06);
      send = Math.min(0.9, wet + dist * 0.008);
      pan = dist > 0.5 ? clamp(_d.dot(this.listener.right) / dist, -1, 1) * 0.85 : 0;
    }
    const input = ctx.createGain();
    input.gain.value = level;
    let node = input;
    if (cutoff < 19000) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.max(900, cutoff);
      lp.Q.value = 0.5;
      node.connect(lp);
      node = lp;
    }
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      node = p;
    }
    node.connect(this.dry);
    if (send > 0) {
      const s = ctx.createGain();
      s.gain.value = send;
      node.connect(s).connect(this.verbIn);
    }
    this.active++;
    const life = (delay + dur + 0.4) * 1000;
    if (this.offline) this.active--;
    else setTimeout(() => { this.active--; input.disconnect(); }, life);
    return { in: input, t: ctx.currentTime + 0.004 + delay };
  }

  // A long-lived voice whose output can be faded out early (reloads, rune hums): returns
  // { in, t, stop() }.
  group(opts) {
    const v = this.voice(opts);
    if (!v) return null;
    const g = this.ctx.createGain();
    g.connect(v.in);
    return { in: g, t: v.t, stop: () => g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02) };
  }

  // ------------------------------------------------------------------ building blocks
  // Gain envelope: silence → peak over `attack` → exponential fall to silence by `t + dur`.
  env(param, t, attack, dur, peak = 1, hold = 0) {
    peak = Math.max(0.0002, peak);
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + Math.max(0.0005, attack));
    if (hold > 0) param.setValueAtTime(peak, t + attack + hold);
    param.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + hold + 0.002, dur));
  }

  sweep(param, t, from, to, dur, exp = true) {
    param.setValueAtTime(from, t);
    if (exp && from > 0 && to > 0) param.exponentialRampToValueAtTime(to, t + dur);
    else param.linearRampToValueAtTime(to, t + dur);
  }

  /**
   * Filtered noise burst. o: { color: white|pink|brown, dur, attack, peak, hold,
   * filter: lowpass|highpass|bandpass, f, f2 (sweep end), q }
   */
  burst(dest, t, o) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise[o.color ?? 'white'];
    src.loop = true;
    src.playbackRate.value = o.rate ?? 1;
    const g = ctx.createGain();
    let head = src;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter;
      f.Q.value = o.q ?? (o.filter === 'bandpass' ? 1.2 : 0.7);
      if (o.f2) this.sweep(f.frequency, t, o.f, o.f2, o.sweep ?? o.dur);
      else f.frequency.value = o.f;
      head.connect(f);
      head = f;
      if (o.filter2) {
        const f2 = ctx.createBiquadFilter();
        f2.type = o.filter2;
        f2.frequency.value = o.f3;
        f2.Q.value = 0.7;
        head.connect(f2);
        head = f2;
      }
    }
    head.connect(g).connect(dest);
    this.env(g.gain, t, o.attack ?? 0.002, o.dur, o.peak ?? 1, o.hold ?? 0);
    const len = src.buffer.duration;
    src.start(t, Math.random() * (len - 0.5));
    src.stop(t + o.dur + 0.05);
    return g;
  }

  /**
   * Oscillator with a pitch sweep and envelope. o: { wave, f, f2, glide (sweep time), dur,
   * attack, peak, hold, drive (soft clip amount), detune }
   */
  tone(dest, t, o) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = o.wave ?? 'sine';
    if (o.f2) this.sweep(osc.frequency, t, o.f, o.f2, o.glide ?? o.dur);
    else osc.frequency.value = o.f;
    if (o.detune) osc.detune.value = o.detune;
    if (o.vib) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = o.vib[0];
      depth.gain.value = o.vib[1];
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + o.dur + 0.05);
    }
    const g = ctx.createGain();
    let head = osc;
    if (o.drive && this.clip) {
      const pre = ctx.createGain();
      pre.gain.value = o.drive;
      const ws = ctx.createWaveShaper();
      ws.curve = this.clip;
      head.connect(pre).connect(ws);
      head = ws;
    }
    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      if (o.lp2) this.sweep(f.frequency, t, o.lp, o.lp2, o.dur);
      else f.frequency.value = o.lp;
      f.Q.value = o.q ?? 0.7;
      head.connect(f);
      head = f;
    }
    head.connect(g).connect(dest);
    this.env(g.gain, t, o.attack ?? 0.002, o.dur, o.peak ?? 1, o.hold ?? 0);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
    return g;
  }

  // Air displaced by something moving fast: a noise band that sweeps up to `f` and swells to its
  // peak at `peakAt` (fraction of `dur`), then falls away — swings, dashes, arrows, jumps.
  whoosh(dest, t, dur, f, { peakAt = 0.5, q = 1, peak = 1, color = 'pink', spread = 2 } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise[color];
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = q;
    const tp = t + dur * peakAt;
    bp.frequency.setValueAtTime(f / spread, t);
    bp.frequency.exponentialRampToValueAtTime(f, tp);
    bp.frequency.exponentialRampToValueAtTime(f / (spread * 0.8), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), tp);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(dest);
    src.start(t, Math.random() * 2);
    src.stop(t + dur + 0.05);
    return g;
  }

  // Struck metal: inharmonic partials (a free bar), each decaying at its own rate.
  ring(dest, t, f, dur, peak = 0.3, partials = [1, 2.76, 5.4, 8.93]) {
    partials.forEach((r, i) => {
      if (f * r > 18000) return;
      this.tone(dest, t, { f: f * r * (1 + (Math.random() - 0.5) * 0.01), dur: dur / (1 + i * 0.6), peak: peak / (1 + i * 0.9), attack: 0.001 });
    });
  }

  // Two-operator FM ping (glassy chimes, energy zings, metallic clanks).
  fm(dest, t, { f, ratio = 1.4, index = 2, dur = 0.3, peak = 0.3, f2 = null, attack = 0.001 }) {
    const ctx = this.ctx;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const depth = ctx.createGain();
    if (f2) this.sweep(car.frequency, t, f, f2, dur);
    else car.frequency.value = f;
    mod.frequency.value = f * ratio;
    this.sweep(depth.gain, t, f * index, f * index * 0.05, dur);
    mod.connect(depth).connect(car.frequency);
    const g = ctx.createGain();
    car.connect(g).connect(dest);
    this.env(g.gain, t, attack, dur, peak);
    car.start(t);
    mod.start(t);
    car.stop(t + dur + 0.05);
    mod.stop(t + dur + 0.05);
    return g;
  }

  // A soft-clipping stage feeding `dest` (grit for booms and crunches).
  drive(dest, amount = 3) {
    const pre = this.ctx.createGain();
    pre.gain.value = amount;
    const ws = this.ctx.createWaveShaper();
    ws.curve = this.clip;
    const post = this.ctx.createGain();
    post.gain.value = 1 / Math.sqrt(amount);
    pre.connect(ws).connect(post).connect(dest);
    return pre;
  }

  // Continuous noise/tone bed whose level and filter the caller drives each frame (wind, slide,
  // glide, charge). Returns { set(level, freq, pitch), stop() }; parks silent when level is 0.
  loop({ color = 'pink', filter = 'bandpass', f = 800, q = 1, tone = null, wet = 0.08 } = {}) {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.dry);
    if (wet) {
      const s = ctx.createGain();
      s.gain.value = wet;
      out.connect(s).connect(this.verbIn);
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise[color];
    src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = filter;
    flt.frequency.value = f;
    flt.Q.value = q;
    const ng = ctx.createGain();
    src.connect(flt).connect(ng).connect(out);
    src.start();
    let osc = null;
    let og = null;
    let toneLp = null;
    if (tone) {
      osc = ctx.createOscillator();
      osc.type = tone.wave ?? 'sine';
      osc.frequency.value = tone.f;
      og = ctx.createGain();
      og.gain.value = tone.mix ?? 0.3;
      let head = osc;
      if (tone.lp) {
        toneLp = ctx.createBiquadFilter();
        toneLp.type = 'lowpass';
        toneLp.frequency.value = tone.lp;
        head.connect(toneLp);
        head = toneLp;
      }
      head.connect(og).connect(out);
      osc.start();
    }
    const L = {
      level: 0,
      // level: output gain; freq: noise filter centre; pitch: tone frequency; bright: tone lowpass.
      set: (level, freq = null, pitch = null, tc = 0.06, bright = null) => {
        const t = ctx.currentTime;
        if (Math.abs(level - L.level) > 1e-4) out.gain.setTargetAtTime(level, t, tc);
        L.level = level;
        if (freq) flt.frequency.setTargetAtTime(freq, t, tc);
        if (pitch && osc) osc.frequency.setTargetAtTime(pitch, t, tc);
        if (bright && toneLp) toneLp.frequency.setTargetAtTime(bright, t, tc);
      },
      noiseMix: (v) => ng.gain.setTargetAtTime(v, ctx.currentTime, 0.05),
      toneMix: (v) => og?.gain.setTargetAtTime(v, ctx.currentTime, 0.05),
    };
    return L;
  }

  // ------------------------------------------------------------------ buffers
  noiseBuffer(color) {
    const ctx = this.ctx;
    const n = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (color === 'white') d[i] = w;
      else if (color === 'pink') {
        // Paul Kellet's refined pink filter.
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    return buf;
  }

  // Outdoor impulse: a dense air tail that darkens as it decays, then two soft late reflections
  // off distant slopes (the "valley echo" behind every shot).
  impulse(sec) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const n = Math.floor(rate * sec);
    const buf = ctx.createBuffer(2, n, rate);
    const echoes = [[0.17, 0.32], [0.41, 0.2], [0.78, 0.09]];
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / rate;
        const k = 0.35 + 0.6 * Math.min(1, t / 0.8); // darker over time
        lp += (Math.random() * 2 - 1 - lp) * (1 - k);
        d[i] = lp * Math.exp(-t * 4.2) * 0.9;
      }
      for (const [at, g] of echoes) {
        const start = Math.floor((at + (ch ? 0.013 : 0)) * rate);
        let e = 0;
        for (let i = 0; i < rate * 0.12 && start + i < n; i++) {
          e += (Math.random() * 2 - 1 - e) * 0.25;
          d[start + i] += e * g * Math.exp(-i / (rate * 0.035));
        }
      }
    }
    return buf;
  }
}

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

function softClipCurve() {
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * 2.2) / Math.tanh(2.2);
  }
  return c;
}
