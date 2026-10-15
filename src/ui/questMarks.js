// Quest marks: one look for a quest's call on someone, wherever it's drawn — over their head
// (ui/WorldLabels.js), on the tracked waypoint at the screen's edge, the compass (ui/HUD.js), the
// minimap and the world map. A mark is { state, tone }:
//   state  'turnin' a quest to hand in ('?') · 'talk' a quest wants a word or a hand ('…') ·
//          'offer' a quest to take ('!') — and on a waypoint, 'objective' (somewhere to go)
//   tone   what kind of quest: 'story' (gilt), 'side' (blue) or 'work' (contracts, bounties,
//          errands, jobs: white)
// Someone can carry several at once (a story quest to hand in and a side quest to take): one per
// state and tone, the most pressing first.
export const TONES = {
  story: { fill: '#ffcf7a', hi: '#fff1cf', ink: '#2a1a04', glow: 'rgba(255,196,92,0.75)' },
  side: { fill: '#5ee6ff', hi: '#dafaff', ink: '#04232b', glow: 'rgba(94,230,255,0.7)' },
  work: { fill: '#e8ecf4', hi: '#ffffff', ink: '#141a26', glow: 'rgba(220,228,244,0.55)' },
};
export const GLYPH = { offer: '!', turnin: '?', talk: '…', objective: '◆' };
const STATE_TEXT = { offer: 'New quest', turnin: 'Turn in', talk: 'Talk', objective: 'Objective' };
const KIND_TEXT = { story: 'Story', side: 'Side', contract: 'Contract', hunt: 'Hunt', errand: 'Errand', job: 'Job' };
const ORDER = { turnin: 0, talk: 1, offer: 2 };
const TONE_ORDER = { story: 0, side: 1, work: 2 };

export const toneOf = (kind) => (kind === 'story' ? 'story' : kind === 'side' ? 'side' : 'work');

// The running quests that want something of `npcId` now: a word, an answer, an object used.
function wanting(log, npcId) {
  const out = [];
  for (const id of Object.keys(log.active)) {
    const q = log.defs.get(id);
    const prog = log.active[id];
    if (!q || !prog) continue;
    const wants = log.objectivesOf(id).some((o, i) => prog[i] < (o.count ?? 1)
      && (((o.type === 'talk' || o.type === 'choose') && log.npcOf(o.npc, q) === npcId) || (o.type === 'use' && log.npcOf(o.object, q) === npcId)));
    if (wants) out.push(q);
  }
  return out;
}

// Every mark someone (or something) carries. `ids`: the quest log ids they answer to (a board's
// postings each have their own); `gives`: whether they hand out quests at all.
export function marksFor(log, ids, gives = true) {
  const out = [];
  const add = (state, q) => {
    const tone = toneOf(q?.kind);
    const have = out.find((m) => m.state === state && m.tone === tone);
    if (have) { have.n++; return; }
    out.push({ state, tone, kind: q?.kind ?? null, title: q?.title ?? '', n: 1 });
  };
  for (const id of ids) {
    for (const q of log.readyToTurnIn(id)) add('turnin', q);
    for (const q of wanting(log, id)) add('talk', q);
    if (gives) for (const q of log.available(id)) add('offer', q);
  }
  return out.sort((a, b) => ORDER[a.state] - ORDER[b.state] || TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
}

// The old single-character form of a list of marks ('?', '…', '!' or null), for what only needs
// to know whether there's one.
export const markerChar = (marks) => (marks.length ? GLYPH[marks[0].state] : null);

export function markLabel(m) {
  return `${KIND_TEXT[m.kind] ? `${KIND_TEXT[m.kind]} quest` : 'Quest'}: ${STATE_TEXT[m.state]}${m.n > 1 ? ` (${m.n})` : ''}`;
}

// ---------------------------------------------------------------- HTML (overhead, waypoint, compass)
const glyphHtml = (state) => (state === 'talk' ? '<i></i><i></i><i></i>' : state === 'objective' ? '<em></em>' : GLYPH[state]);

// One badge; `caption` adds the words under it (shown up close: the .captioned class).
export function markHtml(m, caption = true) {
  const kind = KIND_TEXT[m.kind];
  return `<div class="qm qm-${m.state} qm-${m.tone}" role="img" aria-label="${markLabel(m)}">`
    + `<div class="qm-badge"><span class="qm-glyph">${glyphHtml(m.state)}</span>${m.n > 1 ? `<span class="qm-n">${m.n}</span>` : ''}</div>`
    + `${caption ? `<div class="qm-cap">${kind ? `<b>${kind}</b> ` : ''}${STATE_TEXT[m.state]}</div>` : ''}</div>`;
}

// Several in a line.
export const marksHtml = (marks, caption = true) => `<div class="qm-row">${marks.map((m) => markHtml(m, caption)).join('')}</div>`;

// ---------------------------------------------------------------- canvas (minimap, world map)
// Drawn upright at screen point (x, y), `s` pixels across: the same shield (a speech bubble for
// 'talk', a diamond for an objective), colour and glyph as overhead.
export function drawMark(ctx, x, y, m, s = 14) {
  const T = TONES[m.tone] ?? TONES.work;
  const w = s;
  const h = m.state === 'talk' ? s * 0.8 : m.state === 'objective' ? s : s * 1.13;
  ctx.save();
  ctx.translate(x, y);
  const shape = (pad) => {
    const W = w / 2 + pad;
    const H = h / 2 + pad;
    ctx.beginPath();
    if (m.state === 'talk') {
      const r = Math.min(W, H) * 0.7;
      ctx.moveTo(-W + r, -H);
      ctx.arcTo(W, -H, W, H, r);
      ctx.arcTo(W, H, -W, H, r);
      ctx.lineTo(-W, H);
      ctx.arcTo(-W, -H, W, -H, r);
      ctx.closePath();
    } else if (m.state === 'objective') {
      ctx.moveTo(0, -H); ctx.lineTo(W, 0); ctx.lineTo(0, H); ctx.lineTo(-W, 0); ctx.closePath();
    } else {
      // (as the overhead badge's clip-path: polygon(50% 0, 100% 18%, 100% 62%, 50% 100%, 0 62%, 0 18%))
      ctx.moveTo(0, -H); ctx.lineTo(W, -H + 0.36 * H * 2 * 0.5); ctx.lineTo(W, -H + 1.24 * H);
      ctx.lineTo(0, H); ctx.lineTo(-W, -H + 1.24 * H); ctx.lineTo(-W, -H + 0.36 * H * 2 * 0.5); ctx.closePath();
    }
  };
  ctx.shadowColor = T.glow;
  ctx.shadowBlur = s * 0.45;
  if (m.state === 'turnin') {
    shape(s * 0.16);
    ctx.fillStyle = T.hi;
    ctx.fill();
  }
  shape(s * 0.09);
  ctx.fillStyle = '#0a0c13';
  ctx.fill();
  ctx.shadowBlur = 0;
  shape(0);
  const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  g.addColorStop(0, T.hi);
  g.addColorStop(0.5, T.fill);
  g.addColorStop(1, T.fill);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillStyle = T.ink;
  if (m.state === 'talk') {
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.arc(i * s * 0.22, 0, s * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (m.state === 'objective') {
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.14, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.font = `800 ${Math.round(s * 0.72)}px 'Saira Condensed', 'Arial Narrow', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(GLYPH[m.state], 0, -s * 0.06);
  }
  ctx.restore();
}

// A line of marks centred on (x, y).
export function drawMarks(ctx, x, y, marks, s = 14) {
  const gap = s * 1.25;
  const x0 = x - ((marks.length - 1) * gap) / 2;
  marks.forEach((m, i) => drawMark(ctx, x0 + i * gap, y, m, s));
}
