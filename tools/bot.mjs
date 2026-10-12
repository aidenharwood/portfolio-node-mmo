// Dev bot: signs in to a running server (creating its account and character the first time) and
// jogs a loop near the hub, firing the odd burst, so there's another player to see and test against.
//   node tools/bot.mjs [Name] [http://localhost:8080] [count] [spread]
// With a count, that many bots join (Nameaa, Nameab, …). With a spread (metres), each jogs its
// loop somewhere random within that distance of the hub instead — a load test that spreads the
// realm's work over the map (start the server with AUTH_LIMIT raised so they can all sign in).
// Each bot's password is derived from its name: throwaway local test accounts, not for a public server.
import { WorldGen, HUB } from '../src/world/Gen.js';
import { randomChoice } from '../src/models/heroLooks.js';

const baseName = process.argv[2] ?? 'Botley';
const server = process.argv[3] ?? 'http://localhost:8080';
const count = Number(process.argv[4] ?? 1);
const spread = Number(process.argv[5] ?? 0);
const suffix = (i) => String.fromCharCode(97 + Math.floor(i / 26) % 26) + String.fromCharCode(97 + (i % 26));

async function api(method, path, body, token) {
  const res = await fetch(server + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, ...json };
}

async function runBot(name, index) {
  const account = `bot_${name.toLowerCase()}`;
  const password = `local-bot-${name}-pw`;
  let auth = await api('POST', '/api/login', { name: account, password });
  if (!auth.ok) auth = await api('POST', '/api/register', { name: account, password });
  if (!auth.ok) throw new Error(`${name}: ${auth.error}`);
  const list = await api('GET', '/api/characters', null, auth.token);
  let ch = list.characters?.find((c) => c.name === name);
  if (!ch) {
    const made = await api('POST', '/api/characters', { name, look: randomChoice() }, auth.token);
    if (!made.ok) throw new Error(`${name}: ${made.error}`);
    ch = made.character;
  }

  const ws = new WebSocket(server.replace(/^http/, 'ws') + '/ws');
  ws.onopen = () => ws.send(JSON.stringify({ t: 'auth', token: auth.token, character: ch.id }));
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.t === 'welcome') start(msg);
    else if (msg.t === 'chat' && msg.ch !== 'system') console.log(`[${name}] ${msg.from}: ${msg.text}`);
    else if (msg.t === 'error' || msg.t === 'kicked') console.log(`[${name}]`, msg.error ?? msg.reason);
  };
  ws.onclose = () => { console.log(`[${name}] disconnected`); process.exitCode = 1; };

  function start(welcome) {
    console.log(`[${name}] in the world as #${welcome.id} (seed ${welcome.seed})`);
    const gen = new WorldGen(welcome.seed);
    const types = ['rifle', 'pistol', 'smg', 'sword', 'staff'];
    const type = types[index % types.length];
    const cls = { rifle: 'ranged', pistol: 'ranged', smg: 'ranged', sword: 'melee', staff: 'magic' }[type];
    ws.send(JSON.stringify({
      t: 'profile', lv: 5,
      w: { kind: 'weapon', seed: 4242 + index, level: 5, type, rarity: 'rare' },
      a: { back: { kind: 'armor', seed: 7711, level: 1, slot: 'back', rarity: 'common' } },
    }));
    // Clustered round the hub, or somewhere of its own within `spread` metres.
    const a0 = ((index * 2654435761) % 1000) / 1000 * Math.PI * 2;
    const r0 = spread ? 40 + (((index * 40503) % 1000) / 1000) * spread : 0;
    const cx = spread ? HUB.x + Math.cos(a0) * r0 : HUB.x + 3 * index;
    const cz = spread ? HUB.z + Math.sin(a0) * r0 : HUB.z + 14;
    const R = 7;
    let t = index * 1.7;
    let shotT = 0;
    let attackSeq = 0;
    const step = 1 / 15;
    setInterval(() => {
      t += step;
      const a = t * 0.55;
      const x = cx + Math.cos(a) * R;
      const z = cz + Math.sin(a) * R;
      const vx = -Math.sin(a) * R * 0.55;
      const vz = Math.cos(a) * R * 0.55;
      const facing = Math.atan2(vx, vz);
      const y = gen.height(x, z);
      const firing = cls === 'ranged' && t % 6 < 1.2;
      const swinging = cls === 'melee' && t % 5 < 0.6;
      if (swinging && t % 5 < step) attackSeq++;
      ws.send(JSON.stringify({
        t: 's', p: [x, y, z], f: facing, v: [vx, 0, vz], gr: 1, st: swinging ? 'attack' : 'move', sT: swinging ? t % 5 : 0,
        ci: 0, aq: attackSeq, fl: firing ? 4 : 0, ay: 0, cy: facing, hp: 1,
      }));
      if (firing && (shotT -= step) <= 0) {
        shotT = 0.15;
        const d = [Math.sin(facing), 0.02, Math.cos(facing)];
        ws.send(JSON.stringify({ t: 'fx', list: [{ k: 'shot', o: [x + d[0] * 0.8, y + 1.45, z + d[2] * 0.8], d, pk: 'bullet', c: 0xffd8a0, sp: 400, lf: 0.8, gv: 9.8, wt: type, m: true }] }));
      }
    }, step * 1000);
    setInterval(() => ws.send(JSON.stringify({ t: 'ping', c: Date.now() })), 5000);
  }
}

for (let i = 0; i < count; i++) {
  setTimeout(() => runBot(count > 1 ? `${baseName}${suffix(i)}` : baseName, i).catch((e) => { console.error(e.message); process.exitCode = 1; }), i * 150);
}
