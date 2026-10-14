// Load test: plain HTTP requests as fast as `concurrency` connections can make them, round the
// given paths (health check, status API, the page and its stylesheet by default).
//   npm run load:http [-- [url] [--concurrency=50] [--duration=20] [--paths=/a,/b]]
// Reports requests a second, latency percentiles per path, and status codes / errors.
import { options, target, wait, stopped, Timings, serverStats, reportErrors } from './lib.mjs';

const opts = options('npm run load:http [-- [url] [options]]  — HTTP requests against the server', {
  concurrency: 50, duration: 20, paths: '/healthz,/api/status,/,/style.css',
});
const paths = opts.paths.split(',').map((p) => p.trim()).filter(Boolean);
const server = await target(opts.url);
const per = new Map(paths.map((p) => [p, { t: new Timings(), codes: {} }]));
let done = 0;
let running = true;

async function worker(i) {
  for (let k = i; running; k++) {
    const p = paths[k % paths.length];
    const r = per.get(p);
    const t0 = performance.now();
    let code;
    try {
      const res = await fetch(server.base + p, { signal: AbortSignal.timeout(10_000) });
      await res.arrayBuffer();
      code = res.status;
    } catch (err) {
      code = err.cause?.code ?? err.name;
    }
    r.t.add(performance.now() - t0);
    r.codes[code] = (r.codes[code] ?? 0) + 1;
    done++;
  }
}

console.log(`HTTP load: ${opts.concurrency} connections for ${opts.duration} s → ${server.base} (${paths.join(', ')})`);
const t0 = performance.now();
const workers = Array.from({ length: opts.concurrency }, (_, i) => worker(i));
for (let s = 0, last = 0, lastAt = t0; s < opts.duration && !stopped(); s += 5) {
  await wait(Math.min(5, opts.duration - s) * 1000);
  const now = performance.now();
  console.log(`  ${Math.round((now - t0) / 1000)} s: ${Math.round((done - last) / ((now - lastAt) / 1000))} req/s`);
  last = done;
  lastAt = now;
}
running = false;
await Promise.all(workers);
const secs = (performance.now() - t0) / 1000;

console.log(`\n${done} requests in ${secs.toFixed(1)} s: ${Math.round(done / secs)} req/s`);
let failed = 0;
for (const [p, r] of per) {
  const codes = Object.entries(r.codes).map(([c, n]) => `${c}×${n}`).join(' ');
  failed += Object.entries(r.codes).filter(([c]) => !/^[23]/.test(c)).reduce((a, [, n]) => a + n, 0);
  console.log(`  ${p.padEnd(16)} ${String(r.t.n).padStart(7)}  ${r.t}  [${codes}]`);
}
const st = await serverStats(server.base);
if (st.rss_bytes) console.log(`  server: ${Math.round(st.rss_bytes / 1048576)} MB resident, ${st.cpu_seconds_total?.toFixed(1)} s of processor so far`);
if (failed) console.log(`  ${failed} requests failed or weren't 2xx/3xx`);
const errors = reportErrors(server);
await server.stop();
process.exit(failed > done * 0.01 || errors ? 1 : 0);
